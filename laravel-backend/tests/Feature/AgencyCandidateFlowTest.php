<?php

namespace Tests\Feature;

use App\Enums\AccountStatus;
use App\Enums\DocumentType;
use App\Enums\UserRole;
use App\Models\Agency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AgencyCandidateFlowTest extends TestCase
{
    use RefreshDatabase;

    private function mainAdmin(): User
    {
        return User::create([
            'name' => 'Main Admin',
            'username' => 'main.admin',
            'email' => 'admin@example.com',
            'phone' => '0781311850',
            'password' => 'Admin@1234',
            'role' => UserRole::MainAdmin,
            'status' => AccountStatus::Active,
        ]);
    }

    /**
     * Sends the next request as the owner of this token.
     *
     * The auth guard memoises the user it resolved, and the container is
     * shared across requests inside one test method, so without forgetting
     * the guards a second token would silently keep the first user.
     */
    private function actingWithToken(string $token): static
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken($token);
    }

    /** Walks the three sign-in steps and returns the issued token. */
    private function signIn(string $username, string $password): string
    {
        $login = $this->postJson('/api/auth/login', [
            'username' => $username,
            'password' => $password,
        ])->assertOk()->json('data');

        $this->assertSame('phone', $login['next_step']);
        $this->assertArrayNotHasKey('token', $login, 'the phone step must not issue a token');

        $phone = $this->postJson('/api/auth/verify-phone', [
            'challenge_id' => $login['challenge_id'],
            'code' => $login['dev_code'],
        ])->assertOk()->json('data');

        $this->assertSame('email', $phone['next_step']);
        $this->assertArrayNotHasKey('token', $phone, 'the email step must be required');

        $email = $this->postJson('/api/auth/verify-email', [
            'challenge_id' => $phone['challenge_id'],
            'code' => $phone['dev_code'],
        ])->assertOk()->json('data');

        return $email['token'];
    }

    public function test_main_admin_creates_an_agency_and_receives_its_credentials(): void
    {
        $this->mainAdmin();
        $token = $this->signIn('admin@example.com', 'Admin@1234');

        $response = $this->actingWithToken($token)->postJson('/api/admin/agencies', [
            'name' => 'Skyline Marketing',
            'address' => '221B Baker Street, Colombo 03',
            'username' => 'skyline.admin',
            'email' => 'ops@skyline.lk',
            'phone' => '0711234567',
            'contact_person' => 'Nadia Perera',
        ])->assertCreated();

        $credentials = $response->json('data.credentials');
        $this->assertSame('skyline.admin', $credentials['username']);
        $this->assertNotEmpty($credentials['password']);

        // The password is stored hashed, never in plain text.
        $agencyUser = User::where('username', 'skyline.admin')->firstOrFail();
        $this->assertNotSame($credentials['password'], $agencyUser->password);
        $this->assertTrue(password_verify($credentials['password'], $agencyUser->password));
        $this->assertSame(UserRole::Agency, $agencyUser->role);
    }

    public function test_agency_registers_a_candidate_and_uploads_every_document(): void
    {
        Storage::fake('local');

        $this->mainAdmin();
        $adminToken = $this->signIn('admin@example.com', 'Admin@1234');

        $created = $this->actingWithToken($adminToken)->postJson('/api/admin/agencies', [
            'name' => 'Skyline Marketing',
            'address' => '221B Baker Street, Colombo 03',
            'username' => 'skyline.admin',
            'email' => 'ops@skyline.lk',
            'phone' => '0711234567',
        ])->assertCreated()->json('data');

        // The agency must be approved before its login is usable.
        $agencyId = $created['agency']['id'];
        $this->actingWithToken($adminToken)
            ->postJson('/api/admin/agencies/' . $agencyId . '/status', ['status' => 'active'])
            ->assertOk();

        $agencyToken = $this->signIn('skyline.admin', $created['credentials']['password']);

        // --- candidate registration (no OTP anywhere in this flow) ---
        $candidate = $this->actingWithToken($agencyToken)->postJson('/api/agency/candidates', [
            'name' => 'Kamal Perera',
            'passport_no' => 'N1234567',
            'nic_no' => '901234567V',
            'address' => '12 Temple Road, Negombo',
            'mobile' => '0771234567',
            'email' => 'kamal@example.com',
        ])->assertCreated()->json('data.candidate');

        $this->assertSame($agencyId, $candidate['agency_id']);

        // All eight documents are outstanding at this point.
        $missing = $this->actingWithToken($agencyToken)
            ->getJson('/api/agency/candidates/' . $candidate['id'] . '/documents')
            ->assertOk()->json('data.missing');
        $this->assertCount(8, $missing);

        // --- upload every document type ---
        foreach (DocumentType::cases() as $type) {
            $this->actingWithToken($agencyToken)->postJson(
                '/api/agency/candidates/' . $candidate['id'] . '/documents',
                [
                    'type' => $type->value,
                    'file' => UploadedFile::fake()->create($type->value . '.pdf', 120, 'application/pdf'),
                ]
            )->assertCreated();
        }

        $documents = $this->actingWithToken($agencyToken)
            ->getJson('/api/agency/candidates/' . $candidate['id'] . '/documents')
            ->assertOk()->json('data');

        $this->assertCount(8, $documents['documents']);
        $this->assertSame([], $documents['missing']);

        // With the set complete the candidate can be submitted.
        $this->actingWithToken($agencyToken)
            ->postJson('/api/agency/candidates/' . $candidate['id'] . '/status', ['status' => 'submitted'])
            ->assertOk();
    }

    public function test_submitting_is_blocked_until_every_document_is_attached(): void
    {
        Storage::fake('local');
        [$token] = $this->activeAgency();

        $candidate = $this->actingWithToken($token)->postJson('/api/agency/candidates', [
            'name' => 'Nimal Silva',
            'passport_no' => 'N7654321',
            'nic_no' => '912345678V',
            'address' => '5 Hill Street, Kandy',
            'mobile' => '0759876543',
        ])->assertCreated()->json('data.candidate');

        $this->actingWithToken($token)
            ->postJson('/api/agency/candidates/' . $candidate['id'] . '/status', ['status' => 'submitted'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Upload every required document before submitting.');
    }

    public function test_an_agency_cannot_read_another_agency_candidate(): void
    {
        [$tokenA] = $this->activeAgency('Alpha Agency', 'alpha.admin', 'alpha@a.lk', '0712000001');
        [$tokenB] = $this->activeAgency('Beta Agency', 'beta.admin', 'beta@b.lk', '0712000002');

        $candidate = $this->actingWithToken($tokenA)->postJson('/api/agency/candidates', [
            'name' => 'Sunil Fernando',
            'passport_no' => 'N5555555',
            'nic_no' => '923456789V',
            'address' => '9 Lake Road, Galle',
            'mobile' => '0761112222',
        ])->assertCreated()->json('data.candidate');

        // Agency B must not reach it, and must not see it in its own list.
        $this->actingWithToken($tokenB)
            ->getJson('/api/agency/candidates/' . $candidate['id'])
            ->assertForbidden();

        $this->actingWithToken($tokenB)->getJson('/api/agency/candidates')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_agency_routes_are_closed_to_unauthenticated_callers(): void
    {
        $this->getJson('/api/agency/candidates')->assertUnauthorized();
        $this->getJson('/api/admin/agencies')->assertUnauthorized();
    }

    public function test_an_agency_login_cannot_reach_admin_routes(): void
    {
        [$token] = $this->activeAgency();

        $this->actingWithToken($token)->getJson('/api/admin/agencies')->assertForbidden();
    }

    public function test_duplicate_passport_in_the_same_agency_is_rejected(): void
    {
        [$token] = $this->activeAgency();

        $payload = [
            'name' => 'Kamal Perera',
            'passport_no' => 'N1234567',
            'nic_no' => '901234567V',
            'address' => '12 Temple Road, Negombo',
            'mobile' => '0771234567',
        ];

        $this->actingWithToken($token)->postJson('/api/agency/candidates', $payload)->assertCreated();

        $this->actingWithToken($token)->postJson('/api/agency/candidates', $payload)
            ->assertStatus(422)
            ->assertJsonPath('errors.passport_no', 'A candidate with this passport number already exists.');
    }

    public function test_the_email_step_cannot_be_skipped(): void
    {
        $this->mainAdmin();

        $login = $this->postJson('/api/auth/login', [
            'username' => 'admin@example.com',
            'password' => 'Admin@1234',
        ])->assertOk()->json('data');

        // Feeding the phone challenge to the email endpoint must be refused.
        $this->postJson('/api/auth/verify-email', [
            'challenge_id' => $login['challenge_id'],
            'code' => $login['dev_code'],
        ])->assertStatus(400)
            ->assertJsonPath('message', 'Wrong verification step for this session.');
    }

    public function test_resend_is_refused_inside_the_cooldown(): void
    {
        $this->mainAdmin();

        $login = $this->postJson('/api/auth/login', [
            'username' => 'admin@example.com',
            'password' => 'Admin@1234',
        ])->assertOk()->json('data');

        $this->postJson('/api/auth/resend-otp', ['challenge_id' => $login['challenge_id']])
            ->assertStatus(429);
    }

    public function test_wrong_password_is_rejected(): void
    {
        $this->mainAdmin();

        $this->postJson('/api/auth/login', [
            'username' => 'admin@example.com',
            'password' => 'NotThePassword1',
        ])->assertStatus(401);
    }

    /**
     * Creates an approved agency and returns [token, agency].
     *
     * @return array{0: string, 1: Agency}
     */
    private function activeAgency(
        string $name = 'Skyline Marketing',
        string $username = 'skyline.admin',
        string $email = 'ops@skyline.lk',
        string $phone = '0711234567'
    ): array {
        $agency = Agency::create([
            'code' => Agency::generateCode($name),
            'name' => $name,
            'address' => '221B Baker Street, Colombo 03',
            'email' => $email,
            'phone' => $phone,
            'status' => AccountStatus::Active,
        ]);

        User::create([
            'name' => $name,
            'username' => $username,
            'email' => $email,
            'phone' => $phone,
            'password' => 'Agency@1234',
            'role' => UserRole::Agency,
            'agency_id' => $agency->id,
            'status' => AccountStatus::Active,
        ]);

        return [$this->signIn($username, 'Agency@1234'), $agency];
    }
}

