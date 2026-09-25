<?php

namespace Tests\Feature;

use App\Models\Agency;
use App\Models\Candidate;
use App\Models\OtpChallenge;
use App\Models\Role;
use App\Models\User;
use App\Support\Jwt;
use App\Support\PageAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

/**
 * The Main Admin adds coordinators and opens pages to each one. The server,
 * not only the menu, holds a coordinator to those pages - and a page taken
 * away closes at once, on the session they already hold.
 */
class CoordinatorAccessTest extends TestCase
{
    use RefreshDatabase;

    private string $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();

        $this->admin = Jwt::sign(User::where('role_slug', 'main_admin')->first()->toPublic());

        Agency::create([
            'id' => 'AG-9001',
            'name' => 'Skyline Manpower',
            'code' => 'SKY-9001',
            'address' => '221B Baker Street, Colombo 03',
            'username' => 'skyline.owner',
            'contact' => 'Nadia Perera',
            'email' => 'owner@skyline.lk',
            'status' => 'pending',
        ]);
    }

    private function as(string $token)
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken($token);
    }

    private function tokenFor(int $id): string
    {
        return Jwt::sign(User::findOrFail($id)->toPublic());
    }

    /** Adds a coordinator the way the Coordinators screen does. */
    private function addCoordinator(array $pages, array $overrides = []): array
    {
        return $this->as($this->admin)->postJson('/api/v1/coordinators', $overrides + [
            'name' => 'Kasun Jayawardena',
            'username' => 'kasun.coord',
            'email' => 'kasun@example.lk',
            'phone' => '0715550101',
            'pages' => $pages,
        ])->assertCreated()->json('data');
    }

    public function test_the_main_admin_adds_a_coordinator_who_signs_in_with_the_issued_password(): void
    {
        $created = $this->addCoordinator(['agencies', 'candidates']);

        $this->assertSame(['agencies', 'candidates'], $created['pages']);
        $this->assertSame('active', $created['status']);

        // Left blank, so a strong password was generated and shown once.
        $password = $created['credentials']['password'];
        $this->assertMatchesRegularExpression('/[A-Z]/', $password);
        $this->assertMatchesRegularExpression('/[0-9]/', $password);

        // Like an agency, the first sign-in confirms the phone and then the email.
        $step = $this->postJson('/api/v1/auth/login', ['username' => 'kasun.coord', 'password' => $password])
            ->assertOk()
            ->assertJsonPath('data.steps', ['phone', 'email'])
            ->json('data');

        while ($step['nextStep'] !== 'dashboard') {
            $route = $step['nextStep'] === 'phone' ? 'verify-otp' : 'verify-email';

            $step = $this->postJson('/api/v1/auth/'.$route, [
                'challengeId' => $step['challengeId'],
                'code' => OtpChallenge::find($step['challengeId'])->code,
            ])->assertOk()->json('data');
        }

        $this->assertSame('coordinator', $step['admin']['roleSlug']);
        $this->assertSame(['agencies', 'candidates'], $step['admin']['pages']);
    }

    public function test_each_page_opens_only_what_it_needs(): void
    {
        $this->as($this->tokenFor($this->addCoordinator(['agencies'])['id']));

        // Agency List: every agency, approving and editing - never creating or deleting.
        $this->getJson('/api/v1/agencies')->assertOk()->assertJsonFragment(['id' => 'AG-9001']);
        $this->patchJson('/api/v1/agencies/AG-9001/status', ['status' => 'active'])->assertOk();
        $this->postJson('/api/v1/agencies', [])->assertStatus(403);
        $this->deleteJson('/api/v1/agencies/AG-9001')->assertStatus(403);

        // Pages that were not opened to them.
        $this->getJson('/api/v1/candidates?agencyId=AG-9001')
            ->assertStatus(403)
            ->assertJsonPath('message', PageAccess::REFUSAL);
        $this->getJson('/api/v1/dashboard/stats')->assertStatus(403);
        $this->getJson('/api/v1/verification/agencies')->assertStatus(403);
        $this->getJson('/api/v1/verification/emails')->assertStatus(403);

        // Pages that are never on offer.
        $this->getJson('/api/v1/users')->assertStatus(403);
        $this->getJson('/api/v1/roles')->assertStatus(403);
        $this->getJson('/api/v1/coordinators')->assertStatus(403);
    }

    public function test_a_coordinator_registers_for_an_agency_but_never_attaches(): void
    {
        Candidate::create([
            'agency_id' => 'AG-9001',
            'name' => 'Kamal Perera',
            'passport_no' => 'N7788990',
            'address' => '12 Temple Road, Negombo',
            'mobile' => '0771234567',
            'status' => 'draft',
        ]);

        $this->as($this->tokenFor($this->addCoordinator(['candidates'])['id']));

        // The page picks an agency first, then reads its files.
        $this->getJson('/api/v1/agencies')->assertOk();
        $this->getJson('/api/v1/candidates?agencyId=AG-9001')->assertOk()->assertJsonCount(1, 'data');

        // A coordinator may put a candidate on an agency's register, and the
        // file says so.
        $id = $this->postJson('/api/v1/candidates', [
            'agencyId' => 'AG-9001',
            'name' => 'Nimal Silva',
            'passportNo' => 'N1122334',
            'nicNo' => '881122334V',
            'address' => '8 Lake Road, Kandy',
            'mobile' => '0772223344',
        ])->assertCreated()
            ->assertJsonPath('data.candidate.registeredBy.source', 'coordinator')
            ->json('data.candidate.id');

        // Attaching documents stays the agency's job, and so does the pass.
        $this->postJson('/api/v1/candidates/'.$id.'/documents', [
            'type' => 'medical',
            'file' => UploadedFile::fake()->create('medical.pdf', 40, 'application/pdf'),
        ])->assertStatus(403);
        $this->patchJson('/api/v1/candidates/'.$id.'/pass', ['passed' => true])->assertStatus(403);

        // The police report, though, a coordinator keeps as well.
        $this->patchJson('/api/v1/candidates/'.$id.'/police-report', [
            'status' => 'applied',
            'referenceNo' => 'PR/2026/0042',
        ])->assertOk()->assertJsonPath('data.policeReport.status', 'applied');

        $this->patchJson('/api/v1/agencies/AG-9001/status', ['status' => 'active'])->assertStatus(403);
    }

    public function test_a_coordinator_without_the_candidates_page_cannot_touch_the_police_report(): void
    {
        $candidate = Candidate::create([
            'agency_id' => 'AG-9001',
            'name' => 'Kamal Perera',
            'passport_no' => 'N7788990',
            'address' => '12 Temple Road, Negombo',
            'mobile' => '0771234567',
            'status' => 'draft',
        ]);

        $this->as($this->tokenFor($this->addCoordinator(['dashboard'])['id']));

        $this->patchJson('/api/v1/candidates/'.$candidate->id.'/police-report', [
            'status' => 'applied',
            'referenceNo' => 'PR/2026/0042',
        ])->assertStatus(403);
    }

    public function test_a_page_taken_away_closes_on_the_session_already_held(): void
    {
        $id = $this->addCoordinator(['dashboard', 'verification'])['id'];
        $token = $this->tokenFor($id);

        $this->as($token)->getJson('/api/v1/dashboard/stats')->assertOk();
        $this->getJson('/api/v1/verification/agencies')->assertOk();

        $this->as($this->admin)
            ->putJson('/api/v1/coordinators/'.$id, ['pages' => ['dashboard']])
            ->assertOk()
            ->assertJsonPath('data.pages', ['dashboard']);

        $this->as($token)->getJson('/api/v1/verification/agencies')->assertStatus(403);
        $this->getJson('/api/v1/dashboard/stats')->assertOk();
        $this->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.pages', ['dashboard']);

        // Deactivated, the same session stops working altogether.
        $this->as($this->admin)
            ->patchJson('/api/v1/coordinators/'.$id.'/status', ['status' => 'deactivated'])
            ->assertOk();

        $this->as($token)->getJson('/api/v1/dashboard/stats')->assertStatus(403);
    }

    public function test_only_the_main_admin_manages_coordinators(): void
    {
        $created = $this->addCoordinator(['agencies']);

        $auditor = User::create([
            'name' => 'Ruwan Silva',
            'username' => 'ruwan.audit',
            'email' => 'ruwan@example.lk',
            'phone' => '0715550303',
            'password_hash' => password_hash('Passw0rd1', PASSWORD_BCRYPT),
            'role_slug' => 'auditor',
            'status' => 'active',
        ]);

        foreach ([$this->tokenFor($created['id']), Jwt::sign($auditor->toPublic())] as $token) {
            $this->as($token)->getJson('/api/v1/coordinators')->assertStatus(403);
            $this->putJson('/api/v1/coordinators/'.$created['id'], ['pages' => ['agencies', 'candidates']])
                ->assertStatus(403);
            $this->postJson('/api/v1/coordinators/'.$created['id'].'/password')->assertStatus(403);
        }

        $this->assertSame(['agencies'], User::find($created['id'])->pageAccess());

        // Nor can the role matrix be used to widen a coordinator.
        $this->as($this->admin)
            ->putJson('/api/v1/roles/coordinator/permissions', ['permissions' => Role::emptyMatrix()])
            ->assertStatus(400);
    }

    public function test_details_are_checked_and_unknown_pages_refused(): void
    {
        $valid = [
            'name' => 'Kasun Jayawardena',
            'username' => 'kasun.coord',
            'email' => 'kasun@example.lk',
            'phone' => '0715550101',
        ];

        $this->as($this->admin)->postJson('/api/v1/coordinators', [])
            ->assertStatus(422)
            ->assertJsonStructure(['errors' => ['name', 'username', 'email', 'phone']]);

        // Users is never a page that can be opened to a coordinator.
        $this->postJson('/api/v1/coordinators', $valid + ['pages' => ['users']])
            ->assertStatus(422)
            ->assertJsonStructure(['errors' => ['pages']]);

        $this->postJson('/api/v1/coordinators', $valid + ['password' => 'weakpass'])
            ->assertStatus(422)
            ->assertJsonPath('errors.password', 'Password must include an uppercase letter and a number.');

        $this->postJson('/api/v1/coordinators', ['username' => 'mainadmin'] + $valid)
            ->assertStatus(409)
            ->assertJsonStructure(['errors' => ['username']]);

        $this->assertSame(0, User::where('role_slug', PageAccess::ROLE)->count());
    }

    public function test_the_password_can_be_reset_and_the_coordinator_removed(): void
    {
        $created = $this->addCoordinator(['dashboard'], ['password' => 'Coordin8Pass']);
        $this->assertTrue(password_verify('Coordin8Pass', User::find($created['id'])->password_hash));

        $fresh = $this->as($this->admin)
            ->postJson('/api/v1/coordinators/'.$created['id'].'/password')
            ->assertOk()
            ->json('data.password');

        $hash = User::find($created['id'])->password_hash;
        $this->assertTrue(password_verify($fresh, $hash));
        $this->assertFalse(password_verify('Coordin8Pass', $hash));

        // Only coordinators are reachable here - never the Main Admin's own login.
        $adminId = User::where('role_slug', 'main_admin')->value('id');
        $this->postJson('/api/v1/coordinators/'.$adminId.'/password')->assertStatus(404);
        $this->deleteJson('/api/v1/coordinators/'.$adminId)->assertStatus(404);

        $this->deleteJson('/api/v1/coordinators/'.$created['id'])->assertOk();
        $this->assertNull(User::find($created['id']));
    }

    public function test_the_bell_only_mentions_what_the_coordinators_pages_can_act_on(): void
    {
        $withAgencies = $this->addCoordinator(['agencies'])['id'];
        $withCandidates = $this->addCoordinator(['candidates'], [
            'username' => 'nimali.coord',
            'email' => 'nimali@example.lk',
            'phone' => '0715550202',
        ])['id'];

        $titles = collect($this->as($this->tokenFor($withAgencies))->getJson('/api/v1/notifications')
            ->assertOk()->json('data'))->pluck('title')->all();
        $this->assertContains('Skyline Manpower is awaiting approval', $titles);

        $titles = collect($this->as($this->tokenFor($withCandidates))->getJson('/api/v1/notifications')
            ->assertOk()->json('data'))->pluck('title')->all();
        $this->assertNotContains('Skyline Manpower is awaiting approval', $titles);
    }
}
