<?php

namespace Tests\Feature;

use App\Models\OtpChallenge;
use App\Models\User;
use App\Support\Jwt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * An agency signs in only while it is active.
 *
 * Its owner login is created active, but the agency starts pending, and until
 * the administrator approves it - or once it is deactivated - neither a fresh
 * sign-in nor a session it already holds gets through.
 */
class AgencyApprovalLoginTest extends TestCase
{
    use RefreshDatabase;

    private string $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();

        $this->app['auth']->forgetGuards();
        $this->admin = Jwt::sign(User::where('role_slug', 'main_admin')->first()->toPublic());
    }

    /** Creates an agency the way the admin panel does, so it starts pending. */
    private function createAgency(): string
    {
        return $this->withToken($this->admin)->postJson('/api/v1/agencies', [
            'name' => 'Evoo Recruiters',
            'contact' => 'Hirusha Perera',
            'address' => '12 High Level Road, Homagama',
            'username' => 'evoo.owner',
            'password' => 'Passw0rd1',
            'email' => 'owner@evoo.lk',
            'phone' => '0781311808',
        ])->assertCreated()->assertJsonPath('data.status', 'pending')->json('data.id');
    }

    private function setStatus(string $id, string $status): void
    {
        $this->withToken($this->admin)
            ->patchJson('/api/v1/agencies/'.$id.'/status', ['status' => $status])
            ->assertOk();
    }

    private function login(string $password = 'Passw0rd1')
    {
        return $this->postJson('/api/v1/auth/login', ['username' => 'evoo.owner', 'password' => $password]);
    }

    public function test_a_new_agency_cannot_sign_in_until_it_is_approved(): void
    {
        $id = $this->createAgency();

        $this->login()
            ->assertStatus(403)
            ->assertJsonPath('message', 'Your agency is awaiting approval by the administrator. You can sign in once it has been approved.');

        // Refused before any code is sent.
        $this->assertSame(0, OtpChallenge::count());

        // A wrong password still learns nothing about the agency's state.
        $this->login('WrongPass9')->assertStatus(401);

        // Nor can the password reset be used to get round it.
        $this->postJson('/api/v1/auth/forgot-password', ['username' => 'evoo.owner'])->assertStatus(403);

        $this->setStatus($id, 'active');

        $this->login()->assertOk()->assertJsonPath('data.nextStep', 'phone');
    }

    public function test_deactivating_an_agency_ends_its_sessions_and_its_sign_in(): void
    {
        $id = $this->createAgency();
        $this->setStatus($id, 'active');

        $this->app['auth']->forgetGuards();
        $token = Jwt::sign(User::where('username', 'evoo.owner')->first()->toPublic());
        $this->withToken($token)->getJson('/api/v1/auth/me')->assertOk();

        $this->setStatus($id, 'deactivated');

        // The token it already holds stops working at once.
        $this->withToken($token)
            ->getJson('/api/v1/auth/me')
            ->assertStatus(403)
            ->assertJsonPath('message', 'Your agency has been deactivated. Contact system support.');
        $this->withToken($token)->getJson('/api/v1/candidates')->assertStatus(403);

        $this->login()->assertStatus(403);

        // Reactivated, it signs in again.
        $this->setStatus($id, 'active');
        $this->login()->assertOk();
    }

    public function test_no_session_is_issued_if_the_agency_is_deactivated_mid_sign_in(): void
    {
        $id = $this->createAgency();
        $this->setStatus($id, 'active');

        $phone = $this->login()->assertOk()->json('data.challengeId');
        $email = $this->postJson('/api/v1/auth/verify-otp', [
            'challengeId' => $phone,
            'code' => OtpChallenge::find($phone)->code,
        ])->assertOk()->json('data.challengeId');

        $this->setStatus($id, 'deactivated');

        $this->postJson('/api/v1/auth/verify-email', [
            'challengeId' => $email,
            'code' => OtpChallenge::find($email)->code,
        ])->assertStatus(403)->assertJsonMissingPath('data.token');
    }

    public function test_the_administrator_is_never_held_back_by_an_agency(): void
    {
        $this->createAgency();

        $this->withToken($this->admin)->getJson('/api/v1/auth/me')->assertOk();
    }
}
