<?php

namespace Tests\Feature;

use App\Models\Agency;
use App\Models\OtpChallenge;
use App\Models\User;
use App\Support\Jwt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * An agency owner editing its own agency.
 *
 * Name, contact and address save at once. The phone and email are where
 * sign-in codes go, so they change only after a code sent to the new value
 * comes back.
 */
class AgencyProfileTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $owner;

    private string $token;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();

        $this->agency = Agency::create([
            'id' => 'AG-9001',
            'name' => 'Skyline Manpower',
            'code' => 'SKY-9001',
            'address' => '221B Baker Street, Colombo 03',
            'username' => 'skyline.owner',
            'password_hash' => password_hash('Passw0rd1', PASSWORD_BCRYPT),
            'contact' => 'Nadia Perera',
            'email' => 'owner@skyline.lk',
            'status' => 'active',
        ]);

        $this->owner = $this->login('agency_owner', 'skyline.owner', 'owner@skyline.lk', '0712000001');
        $this->token = $this->tokenFor($this->owner);
    }

    private function login(string $role, string $username, string $email, string $phone, ?string $agencyId = 'AG-9001'): User
    {
        return User::create([
            'name' => 'Nadia Perera',
            'username' => $username,
            'email' => $email,
            'phone' => $phone,
            'password_hash' => password_hash('Passw0rd1', PASSWORD_BCRYPT),
            'role_slug' => $role,
            'agency_name' => 'Skyline Manpower',
            'agency_id' => $agencyId,
            'status' => 'active',
        ]);
    }

    private function tokenFor(User $user): string
    {
        $this->app['auth']->forgetGuards();

        return Jwt::sign($user->toPublic());
    }

    private function owner()
    {
        return $this->withToken($this->token);
    }

    /** Opens a change and hands back the challenge id with the code that was sent. */
    private function requestChange(string $field, string $value): array
    {
        $id = $this->owner()
            ->postJson('/api/v1/agency-profile/contact', ['field' => $field, 'value' => $value])
            ->assertOk()
            ->json('data.challengeId');

        return [$id, OtpChallenge::find($id)->code];
    }

    private function wrongCode(string $code): string
    {
        return $code === '000000' ? '111111' : '000000';
    }

    public function test_the_owner_reads_its_own_agency(): void
    {
        $this->owner()->getJson('/api/v1/agency-profile')
            ->assertOk()
            ->assertJsonPath('data.id', 'AG-9001')
            ->assertJsonPath('data.name', 'Skyline Manpower')
            ->assertJsonPath('data.phone', '0712000001')
            ->assertJsonPath('data.email', 'owner@skyline.lk');
    }

    public function test_details_save_straight_away_and_reach_every_login(): void
    {
        $staff = $this->login('agent', 'skyline.agent', 'agent@skyline.lk', '0712000009');

        $this->owner()->putJson('/api/v1/agency-profile', [
            'name' => 'Skyline Global',
            'contact' => 'Ruwan Silva',
            'address' => '12 Galle Road, Colombo 04',
        ])->assertOk()->assertJsonPath('data.name', 'Skyline Global');

        $agency = $this->agency->fresh();
        $this->assertSame('Skyline Global', $agency->name);
        $this->assertSame('Ruwan Silva', $agency->contact);
        $this->assertSame('12 Galle Road, Colombo 04', $agency->address);

        $this->assertSame('Skyline Global', $staff->fresh()->agency_name);
        $this->assertSame('Ruwan Silva', $this->owner->fresh()->name);

        // What the sidebar reads the agency name from.
        $this->owner()->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('data.agency.name', 'Skyline Global');
    }

    public function test_details_are_validated(): void
    {
        $this->owner()->putJson('/api/v1/agency-profile', [
            'name' => 'AB',
            'contact' => 'Ruwan Silva',
            'address' => 'short',
        ])->assertStatus(422)
            ->assertJsonPath('errors.name', 'Name must be at least 3 characters.')
            ->assertJsonPath('errors.address', 'Please provide the full address.');

        $this->assertSame('Skyline Manpower', $this->agency->fresh()->name);
    }

    public function test_a_new_phone_is_saved_only_once_its_code_is_entered(): void
    {
        $response = $this->owner()
            ->postJson('/api/v1/agency-profile/contact', ['field' => 'phone', 'value' => '0779998888'])
            ->assertOk()
            ->assertJsonPath('data.destination', '0779998888');

        $id = $response->json('data.challengeId');
        $code = OtpChallenge::find($id)->code;

        // SMS delivery is not wired up, so the code comes back to be shown on the page.
        $this->assertSame($code, $response->json('data.devCode'));
        $this->assertSame('0712000001', $this->owner->fresh()->phone);

        $this->owner()->postJson('/api/v1/agency-profile/contact/verify', [
            'challengeId' => $id,
            'code' => $this->wrongCode($code),
        ])->assertStatus(400);
        $this->assertSame('0712000001', $this->owner->fresh()->phone);

        $this->owner()->postJson('/api/v1/agency-profile/contact/verify', [
            'challengeId' => $id,
            'code' => $code,
        ])->assertOk()->assertJsonPath('data.phone', '0779998888');

        $this->assertSame('0779998888', $this->owner->fresh()->phone);
        // Sign-in now finds the owner by it.
        $this->assertSame($this->owner->id, User::findByLoginWithHash('0779998888')?->id);
    }

    public function test_a_new_email_moves_the_login_and_the_agency_together(): void
    {
        [$id, $code] = $this->requestChange('email', 'New@Skyline.lk');

        $this->owner()->postJson('/api/v1/agency-profile/contact/verify', [
            'challengeId' => $id,
            'code' => $code,
        ])->assertOk()->assertJsonPath('data.email', 'new@skyline.lk');

        $this->assertSame('new@skyline.lk', $this->owner->fresh()->email);
        $this->assertSame('new@skyline.lk', $this->agency->fresh()->email);
    }

    public function test_a_phone_or_email_another_login_uses_is_refused(): void
    {
        $this->login('agent', 'skyline.agent', 'agent@skyline.lk', '0713000003');

        // Compared as digits, the way sign-in matches it.
        $this->owner()
            ->postJson('/api/v1/agency-profile/contact', ['field' => 'phone', 'value' => '071 300 0003'])
            ->assertStatus(409);

        $this->owner()
            ->postJson('/api/v1/agency-profile/contact', ['field' => 'email', 'value' => 'AGENT@skyline.lk'])
            ->assertStatus(409);

        $this->assertSame(0, OtpChallenge::count());
    }

    public function test_the_current_value_is_not_a_change(): void
    {
        $this->owner()
            ->postJson('/api/v1/agency-profile/contact', ['field' => 'phone', 'value' => '071 200 0001'])
            ->assertStatus(422);
    }

    public function test_a_change_code_is_neither_another_logins_nor_a_sign_in_step(): void
    {
        [$id, $code] = $this->requestChange('phone', '0779998888');

        Agency::create([
            'id' => 'AG-9002',
            'name' => 'Harbour Recruiters',
            'code' => 'HAR-9002',
            'address' => '5 Harbour Road, Galle',
            'username' => 'harbour.owner',
            'contact' => 'Kasun Silva',
            'email' => 'owner@harbour.lk',
            'status' => 'active',
        ]);
        $other = $this->login('agency_owner', 'harbour.owner', 'owner@harbour.lk', '0714000004', 'AG-9002');

        $this->withToken($this->tokenFor($other))
            ->postJson('/api/v1/agency-profile/contact/verify', ['challengeId' => $id, 'code' => $code])
            ->assertStatus(400);

        $this->postJson('/api/v1/auth/verify-otp', ['challengeId' => $id, 'code' => $code])
            ->assertStatus(400);

        // Neither attempt used the challenge up.
        $this->withToken($this->token)
            ->postJson('/api/v1/agency-profile/contact/verify', ['challengeId' => $id, 'code' => $code])
            ->assertOk();

        $this->assertSame('0714000004', $other->fresh()->phone);
        $this->assertSame('0779998888', $this->owner->fresh()->phone);
    }

    public function test_only_the_agency_owner_gets_in(): void
    {
        $agent = $this->login('agent', 'skyline.agent', 'agent@skyline.lk', '0712000009');
        $admin = User::where('role_slug', 'main_admin')->first();

        foreach ([$agent, $admin] as $user) {
            $this->withToken($this->tokenFor($user))
                ->getJson('/api/v1/agency-profile')
                ->assertStatus(403);
        }
    }
}
