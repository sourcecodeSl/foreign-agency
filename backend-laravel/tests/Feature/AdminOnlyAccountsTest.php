<?php

namespace Tests\Feature;

use App\Models\Agency;
use App\Models\Candidate;
use App\Models\CandidateDocument;
use App\Models\User;
use App\Support\Jwt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Logins are never self-created.
 *
 * The Main Admin is seeded; every agency login is issued from the admin panel.
 * An agency may apply for itself at /auth/register, but that files an
 * application - the login is issued only when an administrator approves it.
 */
class AdminOnlyAccountsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    private function adminToken(): string
    {
        return Jwt::sign(User::where('role_slug', 'main_admin')->firstOrFail()->toPublic());
    }

    /** Signs in, entering whichever codes the login still owes, and returns the token. */
    private function signIn(string $username, string $password): string
    {
        $step = $this->postJson('/api/v1/auth/login', compact('username', 'password'))
            ->assertOk()->json('data');

        while ($step['nextStep'] !== 'dashboard') {
            $route = $step['nextStep'] === 'phone' ? 'verify-otp' : 'verify-email';

            $step = $this->postJson('/api/v1/auth/'.$route, [
                'challengeId' => $step['challengeId'],
                'code' => $step['devCode'],
            ])->assertOk()->json('data');
        }

        return $step['token'];
    }

    public function test_registering_files_an_application_and_issues_no_login(): void
    {
        $this->postJson('/api/v1/auth/register', [
            'name' => 'Someone New',
            'type' => 'local',
            'contact' => 'Nadia Perera',
            'address' => '18 Galle Road, Colombo',
            'email' => 'someone@example.com',
            'phone' => '0771112222',
            // A password sent along is not a password anybody can sign in with.
            'password' => 'Passw0rd1',
        ])->assertCreated();

        // The agency is filed as pending, with no login of any kind.
        $this->assertDatabaseHas('agencies', ['email' => 'someone@example.com', 'status' => 'pending']);
        $this->assertDatabaseMissing('users', ['email' => 'someone@example.com']);

        $this->postJson('/api/v1/auth/login', ['username' => 'someone@example.com', 'password' => 'Passw0rd1'])
            ->assertStatus(401);
    }

    public function test_an_approved_application_is_issued_a_login_it_can_sign_in_with(): void
    {
        $applied = $this->postJson('/api/v1/auth/register', [
            'name' => 'Skyline Manpower',
            'type' => 'foreign',
            'country' => 'Israel',
            'registrationNo' => '514236789',
            'contact' => 'Nadia Perera',
            'address' => '18 Galle Road, Colombo',
            'email' => 'skyline@example.com',
            'phone' => '0771119999',
        ])->assertCreated()->json('data');
        $this->assertNotEmpty($applied['reference']);

        $agency = Agency::where('email', 'skyline@example.com')->firstOrFail();
        $this->assertNull($agency->username);
        $this->assertSame('foreign', $agency->type);

        // The same details cannot be filed twice.
        $this->postJson('/api/v1/auth/register', [
            'name' => 'Skyline Again',
            'type' => 'local',
            'contact' => 'Nadia Perera',
            'address' => '18 Galle Road, Colombo',
            'email' => 'skyline@example.com',
            'phone' => '0772228888',
        ])->assertStatus(409)->assertJsonPath('errors.email', 'That email address is already registered.');

        // Approving it issues the login and hands it to the administrator.
        $credentials = $this->withToken($this->adminToken())
            ->patchJson('/api/v1/agencies/'.$agency->id.'/status', ['status' => 'active'])
            ->assertOk()
            ->json('data.credentials');

        $this->assertNotEmpty($credentials['username']);
        $this->assertSame('skyline@example.com', $credentials['email']['to']);
        $this->assertDatabaseHas('users', ['email' => 'skyline@example.com', 'role_slug' => 'agency_owner']);

        // And that login works, with the codes the first sign-in asks for.
        $this->assertNotEmpty($this->signIn($credentials['username'], $credentials['password']));
    }

    public function test_the_seeded_admin_signs_in_with_its_username(): void
    {
        $admin = User::where('role_slug', 'main_admin')->firstOrFail();

        $this->assertSame('mainadmin', $admin->username);

        $token = $this->signIn('mainadmin', 'Admin@1234');
        $this->assertNotEmpty($token);

        $this->withToken($token)->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('data.roleSlug', 'main_admin')
            ->assertJsonPath('data.username', 'mainadmin');
    }

    public function test_the_admin_can_still_sign_in_with_email_or_phone(): void
    {
        $admin = User::where('role_slug', 'main_admin')->firstOrFail();

        foreach ([$admin->email, $admin->phone] as $identifier) {
            $this->postJson('/api/v1/auth/login', [
                'username' => $identifier,
                'password' => 'Admin@1234',
            ])->assertOk()->assertJsonPath('data.nextStep', 'dashboard');
        }
    }

    public function test_creating_an_agency_also_creates_a_working_login(): void
    {
        $created = $this->withToken($this->adminToken())
            ->postJson('/api/v1/agencies', [
                'name' => 'Skyline Marketing',
                'address' => '221B Baker Street, Colombo 03',
                'username' => 'skyline.owner',
                'password' => 'Skyline@2026',
                'email' => 'owner@skyline.lk',
                'phone' => '0771234567',
                'contact' => 'Nadia Perera',
            ])->assertCreated()->json('data');

        // The agency row and its login are created together.
        $login = User::where('username', 'skyline.owner')->firstOrFail();
        $this->assertSame('agency_owner', $login->role_slug);
        $this->assertSame($created['id'], $login->agency_id);
        $this->assertTrue(password_verify('Skyline@2026', $login->password_hash));

        // Approve the agency, then the issued credentials must actually work.
        $this->withToken($this->adminToken())
            ->patchJson('/api/v1/agencies/'.$created['id'].'/status', ['status' => 'active'])
            ->assertOk();

        $this->app['auth']->forgetGuards();
        $token = $this->signIn('skyline.owner', $created['credentials']['password']);

        $this->withToken($token)->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('data.roleSlug', 'agency_owner');
    }

    public function test_agency_creation_requires_an_email_and_phone_for_sign_in_codes(): void
    {
        $this->withToken($this->adminToken())
            ->postJson('/api/v1/agencies', [
                'name' => 'Skyline Marketing',
                'address' => '221B Baker Street, Colombo 03',
                'username' => 'skyline.owner',
                'password' => 'Skyline@2026',
                'contact' => 'Nadia Perera',
            ])->assertStatus(422)
            ->assertJsonStructure(['errors' => ['email', 'phone']]);
    }

    public function test_credentials_already_in_use_are_rejected(): void
    {
        $payload = [
            'name' => 'Skyline Marketing',
            'address' => '221B Baker Street, Colombo 03',
            'username' => 'skyline.owner',
            'password' => 'Skyline@2026',
            'email' => 'owner@skyline.lk',
            'phone' => '0771234567',
            'contact' => 'Nadia Perera',
        ];

        $this->withToken($this->adminToken())->postJson('/api/v1/agencies', $payload)->assertCreated();

        $this->withToken($this->adminToken())->postJson('/api/v1/agencies', $payload)
            ->assertStatus(409)
            ->assertJsonStructure(['errors' => ['username', 'email', 'phone']]);
    }

    public function test_resetting_credentials_rotates_the_login_password(): void
    {
        $created = $this->withToken($this->adminToken())
            ->postJson('/api/v1/agencies', [
                'name' => 'Skyline Marketing',
                'address' => '221B Baker Street, Colombo 03',
                'username' => 'skyline.owner',
                'password' => 'Skyline@2026',
                'email' => 'owner@skyline.lk',
                'phone' => '0771234567',
                'contact' => 'Nadia Perera',
            ])->assertCreated()->json('data');

        $fresh = $this->withToken($this->adminToken())
            ->postJson('/api/v1/agencies/'.$created['id'].'/credentials/reset')
            ->assertOk()->json('data');

        $login = User::where('username', 'skyline.owner')->firstOrFail();

        // The new password works and the old one no longer does.
        $this->assertTrue(password_verify($fresh['password'], $login->password_hash));
        $this->assertFalse(password_verify('Skyline@2026', $login->password_hash));
    }

    public function test_an_agency_login_cannot_create_agencies(): void
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

        // agency_owner has no agencies.create grant in the permission matrix.
        $this->withToken(Jwt::sign($owner->toPublic()))
            ->postJson('/api/v1/agencies', [
                'name' => 'Sneaky Agency',
                'address' => '1 Nowhere Lane, Colombo 01',
                'username' => 'sneaky.owner',
                'password' => 'Sneaky@2026',
                'email' => 'sneaky@example.lk',
                'phone' => '0719999999',
            ])->assertStatus(403);
    }

    /** Creates an agency through the API and returns its public payload. */
    private function createAgency(array $overrides = []): array
    {
        return $this->withToken($this->adminToken())
            ->postJson('/api/v1/agencies', $overrides + [
                'name' => 'Skyline Marketing',
                'address' => '221B Baker Street, Colombo 03',
                'username' => 'skyline.owner',
                'password' => 'Skyline@2026',
                'email' => 'owner@skyline.lk',
                'phone' => '0771234567',
                'contact' => 'Nadia Perera',
            ])->assertCreated()->json('data');
    }

    public function test_the_contact_person_is_required_and_names_the_owner_login(): void
    {
        $this->withToken($this->adminToken())
            ->postJson('/api/v1/agencies', [
                'name' => 'Skyline Marketing',
                'address' => '221B Baker Street, Colombo 03',
                'username' => 'skyline.owner',
                'password' => 'Skyline@2026',
                'email' => 'owner@skyline.lk',
                'phone' => '0771234567',
            ])->assertStatus(422)
            ->assertJsonPath('errors.contact', 'A contact person is required.');

        $created = $this->createAgency();

        // Stored on the agency and used as the owner login's own name, so the
        // admin is not left calling an account named after the company.
        $this->assertSame('Nadia Perera', $created['contact']);
        $this->assertSame('Nadia Perera', User::where('username', 'skyline.owner')->firstOrFail()->name);
    }

    public function test_an_agency_that_never_started_working_can_be_deleted(): void
    {
        $created = $this->createAgency();

        $this->withToken($this->adminToken())
            ->deleteJson('/api/v1/agencies/'.$created['id'])
            ->assertOk()
            ->assertJsonPath('message', 'Skyline Marketing has been deleted.');

        $this->assertDatabaseMissing('agencies', ['id' => $created['id']]);

        // The login goes with it, which is what frees the username again.
        $this->assertDatabaseMissing('users', ['username' => 'skyline.owner']);
        $this->createAgency();
    }

    public function test_an_agency_with_candidates_is_not_deletable(): void
    {
        $created = $this->createAgency();

        $this->withToken($this->adminToken())
            ->patchJson('/api/v1/agencies/'.$created['id'].'/status', ['status' => 'active'])
            ->assertOk();

        Candidate::create([
            'agency_id' => $created['id'],
            'name' => 'Kamal Perera',
            'passport_no' => 'N7788990',
            'address' => '12 Temple Road, Negombo',
            'mobile' => '0771234567',
            'status' => 'draft',
        ]);

        // candidates.agency_id cascades, so this would take the candidate and
        // every document row with it.
        $this->withToken($this->adminToken())
            ->deleteJson('/api/v1/agencies/'.$created['id'])
            ->assertStatus(409)
            ->assertJsonPath(
                'message',
                'Skyline Marketing has 1 candidate on file, so it cannot be deleted. Deactivate it instead.'
            );

        $this->assertDatabaseHas('agencies', ['id' => $created['id']]);
        $this->assertDatabaseCount('candidates', 1);
    }

    /**
     * The agency is emptied first, then removed. A candidate the agency has
     * already deleted must not keep the agency alive - it was removed on
     * purpose, and the listing shows none left.
     */
    public function test_an_agency_whose_candidates_were_removed_can_be_deleted(): void
    {
        Storage::fake('local');

        $created = $this->createAgency();
        $this->withToken($this->adminToken())
            ->patchJson('/api/v1/agencies/'.$created['id'].'/status', ['status' => 'active'])
            ->assertOk();

        $owner = User::where('username', 'skyline.owner')->firstOrFail();
        $this->app['auth']->forgetGuards();
        $ownerToken = Jwt::sign($owner->toPublic());

        $candidateId = $this->withToken($ownerToken)->postJson('/api/v1/candidates', [
            'name' => 'Kamal Perera',
            'passportNo' => 'N7788990',
            'nicNo' => '901234567V',
            'address' => '12 Temple Road, Negombo',
            'mobile' => '0771234567',
        ])->assertCreated()->json('data.candidate.id');

        // Documents are attached once the candidate has passed, which the
        // admin side records - the agency does not run the test.
        $this->withToken($this->adminToken())
            ->patchJson('/api/v1/candidates/'.$candidateId.'/pass', ['passed' => true])
            ->assertOk();

        // Documents also wait for the police report to be applied for.
        \App\Models\Candidate::whereKey($candidateId)->update(['police_status' => 'applied', 'police_reference_no' => 'PR/2026/0001']);

        $this->withToken($ownerToken)->postJson('/api/v1/candidates/'.$candidateId.'/documents', [
            'type' => 'medical',
            'file' => UploadedFile::fake()->create('medical.pdf', 40, 'application/pdf'),
        ])->assertCreated();

        $path = CandidateDocument::firstOrFail()->path;
        Storage::disk('local')->assertExists($path);

        // The agency removes its candidate, exactly as the UI does.
        $this->withToken($ownerToken)->deleteJson('/api/v1/candidates/'.$candidateId)->assertOk();
        $this->assertSoftDeleted('candidates', ['id' => $candidateId]);

        // The agency is now empty, so it goes.
        $this->withToken($this->adminToken())
            ->deleteJson('/api/v1/agencies/'.$created['id'])
            ->assertOk()
            ->assertJsonPath('message', 'Skyline Marketing has been deleted.');

        $this->assertDatabaseMissing('agencies', ['id' => $created['id']]);

        // Nothing is left behind: no rows, and no orphaned files on disk.
        $this->assertDatabaseCount('candidates', 0);
        $this->assertDatabaseCount('candidate_documents', 0);
        Storage::disk('local')->assertMissing($path);
        Storage::disk('local')->assertMissing('candidates/'.$created['id']);
    }

    public function test_only_the_administrator_can_delete_an_agency(): void
    {
        $created = $this->createAgency();

        $owner = User::where('username', 'skyline.owner')->firstOrFail();

        $this->withToken(Jwt::sign($owner->toPublic()))
            ->deleteJson('/api/v1/agencies/'.$created['id'])
            ->assertStatus(403);

        $this->assertDatabaseHas('agencies', ['id' => $created['id']]);
    }

    public function test_one_agency_carries_the_phone_and_candidate_count_for_its_detail_card(): void
    {
        $created = $this->createAgency();

        $this->withToken($this->adminToken())
            ->getJson('/api/v1/agencies/'.$created['id'])
            ->assertOk()
            // The phone lives on the owner login, not on the agency row.
            ->assertJsonPath('data.phone', '0771234567')
            ->assertJsonPath('data.contact', 'Nadia Perera')
            ->assertJsonPath('data.candidates', 0);
    }
}
