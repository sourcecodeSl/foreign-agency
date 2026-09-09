<?php

namespace Tests\Feature;

use App\Models\Agency;
use App\Models\EmailVerification;
use App\Models\User;
use App\Support\Jwt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A verification request is only the record of a confirmation link that went
 * out, so the admin can clear one away. It is not an account, and removing it
 * must leave the user it was raised for alone.
 */
class EmailVerificationDeleteTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    private function adminToken(): string
    {
        $this->app['auth']->forgetGuards();

        return Jwt::sign(User::where('role_slug', 'main_admin')->firstOrFail()->toPublic());
    }

    private function record(string $id = 'EV-9001'): EmailVerification
    {
        return EmailVerification::create([
            'id' => $id,
            'name' => 'Rehan Silva',
            'email' => 'hello@bluewave.lk',
            'agency' => 'BlueWave Media',
            'status' => 'verified',
            'requested_at' => '2026-09-09 16:28',
            'attempts' => 3,
        ]);
    }

    private function agencyOwnerToken(): string
    {
        $agency = Agency::create([
            'id' => 'AG-9001',
            'name' => 'Alpha Agency',
            'code' => 'ALP-9001',
            'address' => '221B Baker Street, Colombo 03',
            'username' => 'tst.alpha',
            'contact' => 'Owner',
            'email' => 'alpha@example.lk',
            'status' => 'active',
        ]);

        $owner = User::create([
            'name' => 'Alpha Owner',
            'username' => 'alpha.owner',
            'email' => 'owner@alpha.lk',
            'phone' => '0712000001',
            'password_hash' => password_hash('Passw0rd1', PASSWORD_BCRYPT),
            'role_slug' => 'agency_owner',
            'agency_id' => $agency->id,
            'status' => 'active',
        ]);

        $this->app['auth']->forgetGuards();

        return Jwt::sign($owner->toPublic());
    }

    public function test_the_admin_can_remove_a_verification_request(): void
    {
        $record = $this->record();

        $this->withToken($this->adminToken())
            ->deleteJson('/api/v1/verification/emails/'.$record->id)
            ->assertOk()
            ->assertJsonPath('message', 'hello@bluewave.lk has been removed from the list.');

        $this->assertDatabaseMissing('email_verifications', ['id' => $record->id]);

        // Gone from the listing too, while the seeded rows are left alone.
        $listing = $this->withToken($this->adminToken())
            ->getJson('/api/v1/verification/emails')
            ->assertOk()->json('data');

        $this->assertNotContains($record->id, array_column($listing, 'id'));
    }

    public function test_removing_a_request_leaves_the_account_alone(): void
    {
        $record = $this->record();

        $user = User::create([
            'name' => 'Rehan Silva',
            'username' => 'rehan.silva',
            'email' => 'hello@bluewave.lk',
            'phone' => '0712000005',
            'password_hash' => password_hash('Passw0rd1', PASSWORD_BCRYPT),
            'role_slug' => 'agency_owner',
            'status' => 'active',
        ]);

        $this->withToken($this->adminToken())
            ->deleteJson('/api/v1/verification/emails/'.$record->id)
            ->assertOk();

        // The list is a log of sent links, not the account itself.
        $this->assertDatabaseHas('users', ['id' => $user->id, 'email' => 'hello@bluewave.lk']);
    }

    public function test_an_unknown_request_is_a_404(): void
    {
        $this->withToken($this->adminToken())
            ->deleteJson('/api/v1/verification/emails/EV-0000')
            ->assertStatus(404)
            ->assertJsonPath('message', 'Verification request not found.');
    }

    public function test_an_agency_login_cannot_remove_a_verification_request(): void
    {
        $record = $this->record();
        $token = $this->agencyOwnerToken();

        $this->withToken($token)
            ->deleteJson('/api/v1/verification/emails/'.$record->id)
            ->assertStatus(403)
            ->assertJsonPath('message', 'Only the administrator can remove a verification request.');

        $this->assertDatabaseHas('email_verifications', ['id' => $record->id]);
    }

    public function test_a_read_only_auditor_cannot_remove_one_either(): void
    {
        $record = $this->record();

        $auditor = User::create([
            'name' => 'Compliance Auditor',
            'username' => 'the.auditor',
            'email' => 'auditor@example.lk',
            'phone' => '0712000006',
            'password_hash' => password_hash('Passw0rd1', PASSWORD_BCRYPT),
            'role_slug' => 'auditor',
            'status' => 'active',
        ]);
        $this->app['auth']->forgetGuards();

        $this->withToken(Jwt::sign($auditor->toPublic()))
            ->deleteJson('/api/v1/verification/emails/'.$record->id)
            ->assertStatus(403);

        $this->assertDatabaseHas('email_verifications', ['id' => $record->id]);
    }

    public function test_it_needs_a_signed_in_account_at_all(): void
    {
        $record = $this->record();

        $this->deleteJson('/api/v1/verification/emails/'.$record->id)
            ->assertStatus(401);

        $this->assertDatabaseHas('email_verifications', ['id' => $record->id]);
    }
}
