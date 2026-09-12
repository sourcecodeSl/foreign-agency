<?php

namespace Tests\Feature;

use App\Models\Agency;
use App\Models\OtpChallenge;
use App\Models\User;
use App\Support\Jwt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The Email Verification page shows, for every agency, whether its owner has
 * signed in and confirmed the phone and email - read from the login itself -
 * and what is still left to do.
 */
class AgencyVerificationStatusTest extends TestCase
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

    private function agency(string $id, string $status, array $login = []): User
    {
        $slug = strtolower(str_replace('-', '', $id));

        Agency::create([
            'id' => $id,
            'name' => 'Agency '.$id,
            'code' => 'AGN-'.substr($id, 3),
            'address' => '221B Baker Street, Colombo 03',
            'username' => $slug.'.owner',
            'contact' => 'Nadia Perera',
            'email' => $slug.'@example.lk',
            'status' => $status,
        ]);

        return User::create(array_merge([
            'name' => 'Nadia Perera',
            'username' => $slug.'.owner',
            'email' => $slug.'@example.lk',
            'phone' => '07120000'.substr($id, -2),
            'password_hash' => password_hash('Passw0rd1', PASSWORD_BCRYPT),
            'role_slug' => 'agency_owner',
            'agency_id' => $id,
            'status' => 'active',
        ], $login));
    }

    /** The page's rows, keyed by agency id. */
    private function rows(): array
    {
        return collect($this->withToken($this->admin)->getJson('/api/v1/verification/agencies')->assertOk()->json('data'))
            ->keyBy('id')
            ->all();
    }

    public function test_each_agency_shows_what_it_has_done_and_what_is_left(): void
    {
        $now = now()->format('Y-m-d H:i:s');

        $this->agency('AG-9001', 'active');
        $this->agency('AG-9002', 'active', ['phone_verified_at' => $now]);
        $this->agency('AG-9003', 'active', ['phone_verified_at' => $now, 'email_verified_at' => $now, 'last_login_at' => $now]);
        $this->agency('AG-9004', 'pending');
        $this->agency('AG-9005', 'deactivated');

        $rows = $this->rows();

        $this->assertSame('not_signed_in', $rows['AG-9001']['state']);
        $this->assertSame(
            ['Verify the phone number', 'Verify the email address', 'Sign in for the first time'],
            $rows['AG-9001']['pending']
        );

        // Stopped after the phone code.
        $this->assertSame('partial', $rows['AG-9002']['state']);
        $this->assertNotNull($rows['AG-9002']['steps']['phoneVerifiedAt']);
        $this->assertSame(['Verify the email address', 'Sign in for the first time'], $rows['AG-9002']['pending']);

        $this->assertSame('verified', $rows['AG-9003']['state']);
        $this->assertSame([], $rows['AG-9003']['pending']);

        $this->assertSame('awaiting_approval', $rows['AG-9004']['state']);
        $this->assertSame('Approve the agency', $rows['AG-9004']['pending'][0]);

        $this->assertSame('deactivated', $rows['AG-9005']['state']);

        // What each owner's next sign-in will still ask for.
        $this->assertSame(['phone', 'email'], $rows['AG-9001']['nextSignInAsks']);
        $this->assertSame(['email'], $rows['AG-9002']['nextSignInAsks']);
        $this->assertSame([], $rows['AG-9003']['nextSignInAsks']);

        // The seeded demo agencies have no owner login at all.
        $this->assertSame('no_login', $rows['AG-1041']['state']);
        $this->assertNull($rows['AG-1041']['owner']);
    }

    public function test_the_row_follows_the_owner_through_a_real_sign_in(): void
    {
        $this->agency('AG-9001', 'active');

        $phone = $this->postJson('/api/v1/auth/login', ['username' => 'ag9001.owner', 'password' => 'Passw0rd1'])
            ->assertOk()->json('data.challengeId');

        $email = $this->postJson('/api/v1/auth/verify-otp', [
            'challengeId' => $phone,
            'code' => OtpChallenge::find($phone)->code,
        ])->assertOk()->json('data.challengeId');

        // Phone done, email not yet.
        $this->assertSame('partial', $this->rows()['AG-9001']['state']);

        $this->postJson('/api/v1/auth/verify-email', [
            'challengeId' => $email,
            'code' => OtpChallenge::find($email)->code,
        ])->assertOk();

        $row = $this->rows()['AG-9001'];
        $this->assertSame('verified', $row['state']);
        $this->assertNotNull($row['steps']['signedInAt']);
    }

    public function test_an_agency_login_cannot_read_every_agency(): void
    {
        $owner = $this->agency('AG-9001', 'active');
        $this->app['auth']->forgetGuards();

        $this->withToken(Jwt::sign($owner->toPublic()))
            ->getJson('/api/v1/verification/agencies')
            ->assertStatus(403);
    }
}
