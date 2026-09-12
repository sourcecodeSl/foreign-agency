<?php

namespace Tests\Feature;

use App\Models\Agency;
use App\Models\OtpChallenge;
use App\Models\User;
use App\Support\Jwt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The Main Admin signs in with the password alone. An agency login confirms
 * its phone and email once, on its first sign-in, and is never asked again
 * for a detail it has already confirmed.
 */
class FirstSignInVerificationTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();

        Agency::create([
            'id' => 'AG-9001',
            'name' => 'Skyline Manpower',
            'code' => 'SKY-9001',
            'address' => '221B Baker Street, Colombo 03',
            'username' => 'skyline.owner',
            'contact' => 'Nadia Perera',
            'email' => 'owner@skyline.lk',
            'status' => 'active',
        ]);

        $this->owner = User::create([
            'name' => 'Nadia Perera',
            'username' => 'skyline.owner',
            'email' => 'owner@skyline.lk',
            'phone' => '0712000001',
            'password_hash' => password_hash('Passw0rd1', PASSWORD_BCRYPT),
            'role_slug' => 'agency_owner',
            'agency_name' => 'Skyline Manpower',
            'agency_id' => 'AG-9001',
            'status' => 'active',
        ]);
    }

    private function login(string $username = 'skyline.owner', string $password = 'Passw0rd1')
    {
        return $this->postJson('/api/v1/auth/login', compact('username', 'password'))->assertOk();
    }

    /** Enters the code that was sent for a challenge. */
    private function enter(string $route, string $challengeId)
    {
        return $this->postJson('/api/v1/auth/'.$route, [
            'challengeId' => $challengeId,
            'code' => OtpChallenge::find($challengeId)->code,
        ]);
    }

    public function test_the_administrator_signs_in_with_the_password_alone(): void
    {
        $token = $this->login('mainadmin', 'Admin@1234')
            ->assertJsonPath('data.nextStep', 'dashboard')
            ->assertJsonPath('data.admin.roleSlug', 'main_admin')
            ->json('data.token');

        // No code was opened, so nothing was texted or emailed.
        $this->assertSame(0, OtpChallenge::count());

        $this->withToken($token)->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('data.username', 'mainadmin');
    }

    public function test_the_administrator_is_not_asked_even_with_nothing_confirmed(): void
    {
        User::where('role_slug', 'main_admin')->update(['phone_verified_at' => null, 'email_verified_at' => null]);

        $this->login('mainadmin', 'Admin@1234')->assertJsonPath('data.nextStep', 'dashboard');

        $this->assertSame(0, OtpChallenge::count());
    }

    public function test_an_agency_confirms_its_phone_and_email_on_the_first_sign_in_only(): void
    {
        $phone = $this->login()
            ->assertJsonPath('data.nextStep', 'phone')
            ->assertJsonPath('data.steps', ['phone', 'email'])
            ->json('data.challengeId');

        $email = $this->enter('verify-otp', $phone)
            ->assertOk()
            ->assertJsonPath('data.nextStep', 'email')
            ->json('data.challengeId');

        $this->enter('verify-email', $email)
            ->assertOk()
            ->assertJsonPath('data.nextStep', 'dashboard')
            ->assertJsonStructure(['data' => ['token']]);

        $owner = $this->owner->fresh();
        $this->assertNotNull($owner->phone_verified_at);
        $this->assertNotNull($owner->email_verified_at);

        // Both confirmed, so every later sign-in opens the session at once.
        OtpChallenge::query()->delete();

        $token = $this->login()
            ->assertJsonPath('data.nextStep', 'dashboard')
            ->json('data.token');

        $this->assertSame(0, OtpChallenge::count());

        $this->withToken($token)->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('data.roleSlug', 'agency_owner');
    }

    public function test_a_sign_in_that_stopped_after_the_phone_asks_only_for_the_email(): void
    {
        $this->enter('verify-otp', $this->login()->json('data.challengeId'))->assertOk();

        // Walked away before the email code; the phone is not asked again.
        $email = $this->login()
            ->assertJsonPath('data.nextStep', 'email')
            ->assertJsonPath('data.steps', ['email'])
            ->json('data.challengeId');

        $this->enter('verify-email', $email)
            ->assertOk()
            ->assertJsonPath('data.nextStep', 'dashboard');
    }

    public function test_an_email_already_confirmed_is_not_asked_again(): void
    {
        // A password reset, for one, proves the address.
        $this->owner->update(['email_verified_at' => now()]);

        $phone = $this->login()
            ->assertJsonPath('data.nextStep', 'phone')
            ->assertJsonPath('data.steps', ['phone'])
            ->json('data.challengeId');

        $this->enter('verify-otp', $phone)
            ->assertOk()
            ->assertJsonPath('data.nextStep', 'dashboard')
            ->assertJsonStructure(['data' => ['token']]);
    }

    public function test_a_contact_changed_by_the_administrator_is_confirmed_again(): void
    {
        $this->owner->update(['phone_verified_at' => now(), 'email_verified_at' => now()]);
        $admin = Jwt::sign(User::where('role_slug', 'main_admin')->first()->toPublic());

        // The same address, written differently, keeps its confirmation.
        $this->withToken($admin)
            ->putJson('/api/v1/users/'.$this->owner->id, ['email' => ' OWNER@skyline.lk ', 'phone' => '071 200 0001'])
            ->assertOk();
        $this->assertSame([], $this->owner->fresh()->unconfirmedContacts());

        // A new number does not.
        $this->withToken($admin)
            ->putJson('/api/v1/users/'.$this->owner->id, ['phone' => '0779998888'])
            ->assertOk();

        $owner = $this->owner->fresh();
        $this->assertNull($owner->phone_verified_at);
        $this->assertNotNull($owner->email_verified_at);

        $this->login()
            ->assertJsonPath('data.nextStep', 'phone')
            ->assertJsonPath('data.steps', ['phone']);
    }

    public function test_no_session_if_the_agency_is_deactivated_while_the_last_code_was_open(): void
    {
        $this->owner->update(['email_verified_at' => now()]);
        $phone = $this->login()->json('data.challengeId');

        Agency::where('id', 'AG-9001')->update(['status' => 'deactivated']);

        $this->enter('verify-otp', $phone)
            ->assertStatus(403)
            ->assertJsonMissingPath('data.token');
    }
}
