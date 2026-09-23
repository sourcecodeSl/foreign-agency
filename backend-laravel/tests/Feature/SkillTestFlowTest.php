<?php

namespace Tests\Feature;

use App\Models\Agency;
use App\Models\Candidate;
use App\Models\ForeignCompany;
use App\Models\JobRole;
use App\Models\SkillTest;
use App\Models\User;
use App\Support\Jwt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The testing pool: a coordinator books a candidate with one of their own
 * foreign companies, a fail keeps the candidate available to everybody, and a
 * pass locks them to that company alone.
 */
class SkillTestFlowTest extends TestCase
{
    use RefreshDatabase;

    private string $admin;

    private string $coordinator;

    private int $coordinatorId;

    private string $agencyToken;

    /** Keeps each test account's phone number its own. */
    private int $accounts = 0;

    private Candidate $candidate;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();

        $this->admin = Jwt::sign(User::where('role_slug', 'main_admin')->first()->toPublic());
        $this->coordinatorId = (int) $this->addCoordinator('kasun.coord', ['candidates', 'companies']);
        $this->coordinator = Jwt::sign(User::findOrFail($this->coordinatorId)->toPublic());

        Agency::create([
            'id' => 'AG-9001',
            'name' => 'Solidrow',
            'code' => 'SOL-9001',
            'address' => '221B Baker Street, Colombo 03',
            'username' => 'solidrow.owner',
            'contact' => 'Nadia Perera',
            'email' => 'owner@solidrow.lk',
            'status' => 'active',
        ]);

        $owner = User::create([
            'name' => 'Nadia Perera',
            'username' => 'solidrow.owner',
            'email' => 'owner@solidrow.lk',
            'phone' => '0712000001',
            'password_hash' => password_hash('Passw0rd1', PASSWORD_BCRYPT),
            'role_slug' => 'agency_owner',
            'agency_id' => 'AG-9001',
            'status' => 'active',
        ]);
        $this->agencyToken = Jwt::sign($owner->toPublic());

        $this->candidate = Candidate::create([
            'agency_id' => 'AG-9001',
            'name' => 'Kamal Perera',
            'passport_no' => 'N7788990',
            'address' => '12 Temple Road, Negombo',
            'mobile' => '0771234567',
            'status' => 'draft',
        ]);
    }

    private function as(string $token)
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken($token);
    }

    private function addCoordinator(string $username, array $pages): int
    {
        return (int) $this->as($this->admin)->postJson('/api/v1/coordinators', [
            'name' => ucfirst(strtok($username, '.')).' Coordinator',
            'username' => $username,
            'email' => $username.'@example.lk',
            'phone' => '071555'.str_pad((string) ++$this->accounts, 4, '0', STR_PAD_LEFT),
            'pages' => $pages,
        ])->assertCreated()->json('data.id');
    }

    private function company(string $name = 'Herzl Construction', ?int $coordinatorId = null): int
    {
        return (int) ForeignCompany::create([
            'code' => ForeignCompany::nextCode(),
            'name' => $name,
            'country' => 'Israel',
            'city' => 'Tel Aviv',
            'coordinator_id' => $coordinatorId ?? $this->coordinatorId,
            'status' => 'active',
        ])->id;
    }

    private function roleId(string $name): int
    {
        return (int) JobRole::where('name', $name)->firstOrFail()->id;
    }

    /** Books the candidate for a role with a company, as whoever is signed in. */
    private function book(int $companyId, string $role)
    {
        return $this->postJson('/api/v1/tests', [
            'candidateId' => $this->candidate->id,
            'companyId' => $companyId,
            'jobRoleId' => $this->roleId($role),
        ]);
    }

    private function decide(int $testId, string $result, ?string $note = null)
    {
        return $this->patchJson('/api/v1/tests/'.$testId.'/result', array_filter([
            'result' => $result,
            'note' => $note,
        ]));
    }

    public function test_a_failed_role_can_be_retried_the_same_day_without_a_second_candidate(): void
    {
        $this->as($this->coordinator);
        $company = $this->company();

        $first = $this->book($company, 'Tiler')->assertCreated()->json('data');
        $this->assertSame('TST-1001', $first['testNo']);
        $this->assertSame('Tiler', $first['jobRole']);
        $this->assertSame('testing', $this->candidate->fresh()->pool_status);

        $this->decide($first['id'], 'fail', 'Cutting not accurate enough')
            ->assertOk()
            ->assertJsonPath('data.status', 'failed');
        $this->assertSame('pool', $this->candidate->fresh()->pool_status);

        // Same day, a different trade - one candidate record, a new test number.
        $second = $this->book($company, 'Shuttering Carpenter')->assertCreated()->json('data');
        $this->assertSame('TST-1002', $second['testNo']);
        $this->assertSame('Shuttering Carpenter', $second['jobRole']);
        $this->assertSame(1, Candidate::where('passport_no', 'N7788990')->count());
        $this->assertSame(2, SkillTest::where('candidate_id', $this->candidate->id)->count());

        // The failed attempt keeps its own record of what happened.
        $failed = SkillTest::find($first['id']);
        $this->assertSame('failed', $failed->status);
        $this->assertSame('Cutting not accurate enough', $failed->result_note);
    }

    public function test_an_agency_registers_a_candidate_for_a_foreign_company_which_records_the_result(): void
    {
        // The foreign company that signs in, with its own owner login.
        Agency::create([
            'id' => 'AG-9100',
            'name' => 'Herzl Construction',
            'code' => 'HER-9100',
            'type' => 'foreign',
            'country' => 'Israel',
            'address' => '12 Herzl Street, Tel Aviv',
            'username' => 'herzl.owner',
            'contact' => 'Avi Cohen',
            'email' => 'owner@herzl.example',
            'status' => 'active',
        ]);
        $companyOwner = User::create([
            'name' => 'Avi Cohen',
            'username' => 'herzl.owner',
            'email' => 'owner@herzl.example',
            'phone' => '0712000009',
            'password_hash' => password_hash('Passw0rd1', PASSWORD_BCRYPT),
            'role_slug' => 'agency_owner',
            'agency_id' => 'AG-9100',
            'status' => 'active',
        ]);
        $companyToken = Jwt::sign($companyOwner->toPublic());

        // The local agency picks the company it is registering the candidate for.
        $this->as($this->agencyToken)
            ->getJson('/api/v1/agencies/foreign-options')
            ->assertOk()
            ->assertJsonFragment(['id' => 'AG-9100', 'name' => 'Herzl Construction']);

        $registered = $this->postJson('/api/v1/candidates', [
            'firstName' => 'Nimal',
            'lastName' => 'Silva',
            'passportNo' => 'N1122334',
            'nicNo' => '901234567V',
            'address' => '9 Lake Road, Kandy',
            'mobile' => '0779998887',
            'companyAgencyId' => 'AG-9100',
            'jobRoleIds' => [$this->roleId('Tiler'), $this->roleId('Mason')],
        ])->assertCreated()->json('data.candidate');

        $this->assertSame('AG-9100', $registered['company']['id']);

        // The company reads whoever was registered for it, and which agency sent them.
        $listed = $this->as($companyToken)->getJson('/api/v1/candidates')->assertOk()->json('data');
        $this->assertCount(1, $listed);
        $this->assertSame('Nimal Silva', $listed[0]['name']);
        $this->assertSame('Solidrow', $listed[0]['agencyName']);

        // It records the result, which names the trade and sets the profession.
        $this->patchJson('/api/v1/candidates/'.$registered['id'].'/test-result', [
            'result' => 'pass',
            'jobRoleId' => $this->roleId('Mason'),
            'note' => 'Clean work',
            'testResults' => 'NVQ Level 3 - Pass',
        ])
            ->assertOk()
            ->assertJsonPath('data.testResults', 'NVQ Level 3 - Pass')
            ->assertJsonPath('data.profession', 'Mason')
            ->assertJsonPath('data.poolStatus', 'passed')
            ->assertJsonPath('data.testResult.result', 'pass')
            ->assertJsonPath('data.testResult.jobRole', 'Mason');

        // Another company may not touch a candidate that is not registered for it.
        $other = Agency::create([
            'id' => 'AG-9101',
            'name' => 'Negev Builders',
            'code' => 'NEG-9101',
            'type' => 'foreign',
            'country' => 'Israel',
            'address' => '5 Negev Road, Beersheba',
            'username' => 'negev.owner',
            'contact' => 'Dana Levi',
            'email' => 'owner@negev.example',
            'status' => 'active',
        ]);
        $otherOwner = User::create([
            'name' => 'Dana Levi',
            'username' => 'negev.owner',
            'email' => 'owner@negev.example',
            'phone' => '0712000010',
            'password_hash' => password_hash('Passw0rd1', PASSWORD_BCRYPT),
            'role_slug' => 'agency_owner',
            'agency_id' => $other->id,
            'status' => 'active',
        ]);

        $this->as(Jwt::sign($otherOwner->toPublic()))
            ->patchJson('/api/v1/candidates/'.$registered['id'].'/test-result', ['result' => 'fail'])
            ->assertForbidden();
        $this->getJson('/api/v1/candidates')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_the_trade_passed_in_becomes_the_candidates_profession(): void
    {
        $this->as($this->coordinator);
        $company = $this->company();

        // Nothing is typed in: the file carries no profession until a pass.
        $this->assertNull($this->candidate->fresh()->profession);

        $failed = $this->book($company, 'Tiler')->assertCreated()->json('data');
        $this->decide($failed['id'], 'fail')->assertOk();
        $this->assertNull($this->candidate->fresh()->profession);

        $passed = $this->book($company, 'Shuttering Carpenter')->assertCreated()->json('data');
        $this->decide($passed['id'], 'pass')->assertOk();

        $this->assertSame('Shuttering Carpenter', $this->candidate->fresh()->profession);
        $this->getJson('/api/v1/candidates/'.$this->candidate->id)
            ->assertOk()
            ->assertJsonPath('data.profession', 'Shuttering Carpenter');
    }

    public function test_a_second_trade_joins_the_same_file_with_its_own_test_number(): void
    {
        $this->as($this->coordinator);
        $company = $this->company();

        $tiler = $this->book($company, 'Tiler')->assertCreated()->json('data');
        $this->decide($tiler['id'], 'fail')->assertOk();

        $this->book($company, 'Shuttering Carpenter')
            ->assertCreated()
            ->assertJsonPath('data.testNo', 'TST-1002')
            ->assertJsonPath('data.candidateId', $this->candidate->id);

        // One file carrying both trades, and both attempts on its history.
        $detail = $this->getJson('/api/v1/candidates/'.$this->candidate->id)->assertOk()->json('data');
        $this->assertSame(['Tiler', 'Shuttering Carpenter'], array_column($detail['jobRoles'], 'name'));
        $this->assertSame(['TST-1002', 'TST-1001'], array_column($detail['tests'], 'testNo'));
        $this->assertSame(['scheduled', 'failed'], array_column($detail['tests'], 'status'));
        $this->assertSame('Tiler', $detail['jobRole']);

        // Testing the same trade again does not list it twice.
        $this->book($company, 'Tiler')->assertCreated();
        $this->assertSame(2, $this->candidate->fresh()->jobRoles()->count());
    }

    public function test_the_booking_message_names_the_attempt_it_closed(): void
    {
        $this->as($this->coordinator);
        $company = $this->company();

        $this->book($company, 'Tiler')->assertCreated();
        $this->book($company, 'Shuttering Carpenter')
            ->assertCreated()
            ->assertJsonPath('message', 'Kamal Perera is booked for Shuttering Carpenter with Herzl Construction as TST-1002. TST-1001 is closed.');
    }

    public function test_booking_a_new_test_closes_the_one_still_open(): void
    {
        $this->as($this->coordinator);
        $company = $this->company();

        $first = $this->book($company, 'Tiler')->assertCreated()->json('data');
        $second = $this->book($company, 'Mason')->assertCreated()->json('data');

        $this->assertSame('closed', SkillTest::find($first['id'])->status);
        $this->assertSame('scheduled', SkillTest::find($second['id'])->status);

        // A closed attempt can no longer take a result.
        $this->decide($first['id'], 'pass')->assertStatus(409);
    }

    public function test_passing_locks_the_candidate_to_that_company(): void
    {
        $this->as($this->coordinator);
        $herzl = $this->company('Herzl Construction');
        $negev = $this->company('Negev Farms');

        $test = $this->book($herzl, 'Tiler')->assertCreated()->json('data');
        $this->decide($test['id'], 'pass', 'Strong practical test')
            ->assertOk()
            ->assertJsonPath('data.status', 'passed');

        $candidate = $this->candidate->fresh();
        $this->assertSame('passed', $candidate->pool_status);
        $this->assertSame($herzl, (int) $candidate->locked_company_id);
        $this->assertNotNull($candidate->locked_at);

        // No other company may test them, nor see them in its roster.
        $this->book($negev, 'Mason')->assertStatus(409);
        $this->getJson('/api/v1/companies/'.$herzl.'/candidates')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/companies/'.$negev.'/candidates')->assertOk()->assertJsonCount(0, 'data');

        // And the lock travels with the candidate record itself.
        $this->getJson('/api/v1/candidates/'.$this->candidate->id)
            ->assertOk()
            ->assertJsonPath('data.poolStatus', 'passed')
            ->assertJsonPath('data.lockedCompany.name', 'Herzl Construction');
    }

    public function test_a_coordinator_only_works_with_their_own_companies(): void
    {
        $mine = $this->company('Herzl Construction');
        $theirs = $this->company('Haifa Care', $this->addCoordinator('nimali.coord', ['companies']));

        $this->as($this->coordinator);
        $this->getJson('/api/v1/companies')->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $mine);
        $this->getJson('/api/v1/companies/'.$theirs)->assertStatus(403);
        $this->book($theirs, 'Tiler')->assertStatus(403);
    }

    public function test_an_agency_watches_its_own_tests_but_runs_none(): void
    {
        $this->as($this->coordinator);
        $company = $this->company();
        $test = $this->book($company, 'Tiler')->assertCreated()->json('data');

        $this->as($this->agencyToken);
        $this->getJson('/api/v1/tests')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.testNo', $test['testNo']);

        $this->postJson('/api/v1/tests', [
            'candidateId' => $this->candidate->id,
            'companyId' => $company,
            'jobRoleId' => $this->roleId('Mason'),
        ])->assertStatus(403);
        $this->decide($test['id'], 'pass')->assertStatus(403);
        $this->getJson('/api/v1/companies')->assertStatus(403);
    }

    public function test_a_coordinator_without_the_companies_page_is_refused(): void
    {
        $limited = Jwt::sign(User::findOrFail($this->addCoordinator('ruwan.coord', ['candidates']))->toPublic());
        $company = $this->company();

        $this->as($limited);
        $this->getJson('/api/v1/companies')->assertStatus(403);
        $this->book($company, 'Tiler')->assertStatus(403);

        // The candidate pool is still theirs to read - that page was opened.
        $this->getJson('/api/v1/candidates?agencyId=all')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_the_master_candidate_list_spans_every_agency(): void
    {
        $this->as($this->admin);

        $this->getJson('/api/v1/candidates?agencyId=all')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.agencyName', 'Solidrow')
            ->assertJsonPath('data.0.poolStatus', 'pool');

        // Picking nothing still lists nothing, as the by-agency screen expects.
        $this->getJson('/api/v1/candidates')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_job_roles_are_listed_for_everyone_and_added_by_the_admin(): void
    {
        $this->as($this->agencyToken)->getJson('/api/v1/job-roles')
            ->assertOk()
            ->assertJsonFragment(['name' => 'Shuttering Carpenter']);

        $this->postJson('/api/v1/job-roles', ['name' => 'Scaffolder'])->assertStatus(403);

        $this->as($this->admin)->postJson('/api/v1/job-roles', ['name' => 'Scaffolder'])->assertCreated();
        $this->postJson('/api/v1/job-roles', ['name' => 'Scaffolder'])->assertStatus(409);
    }

    public function test_a_coordinator_adds_and_removes_job_categories(): void
    {
        $this->as($this->coordinator)->postJson('/api/v1/job-roles', ['name' => 'Scaffolder'])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Scaffolder');

        $tiler = $this->roleId('Tiler');

        // A trade already on a candidate and a test is only taken off the list.
        $this->book($this->company(), 'Tiler')->assertCreated();
        $this->deleteJson('/api/v1/job-roles/'.$tiler)->assertOk();
        $names = array_column($this->getJson('/api/v1/job-roles')->json('data'), 'name');
        $this->assertNotContains('Tiler', $names);
        $this->assertContains('Scaffolder', $names);
        $this->assertSame('Tiler', $this->candidate->fresh()->jobRoles()->first()->name);

        // Adding it again brings back the same row.
        $this->postJson('/api/v1/job-roles', ['name' => 'tiler'])
            ->assertOk()
            ->assertJsonPath('data.id', $tiler);

        // An agency reads the list but cannot change it.
        $this->as($this->agencyToken)->deleteJson('/api/v1/job-roles/'.$tiler)->assertStatus(403);
    }

    public function test_a_candidate_who_fails_one_company_can_pass_with_another(): void
    {
        $this->as($this->coordinator);
        $herzl = $this->company('Herzl Construction');
        $negev = $this->company('Negev Farms');

        // Herzl tests them and says no, so they go back to the pool.
        $first = $this->book($herzl, 'Tiler')->assertCreated()->json('data');
        $this->decide($first['id'], 'fail', 'Not up to standard')->assertOk();
        $this->assertSame('pool', $this->candidate->fresh()->pool_status);

        // Negev comes along later, tests them for another trade, and takes them.
        $second = $this->book($negev, 'Agriculture Worker')->assertCreated()->json('data');
        $this->assertNotSame($first['testNo'], $second['testNo']);
        $this->decide($second['id'], 'pass')->assertOk();

        $this->assertSame($negev, (int) $this->candidate->fresh()->locked_company_id);

        // They are Negev's now: Herzl neither lists them nor may test them again.
        $this->getJson('/api/v1/companies/'.$negev.'/candidates')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/companies/'.$herzl.'/candidates')->assertOk()->assertJsonCount(0, 'data');
        $this->book($herzl, 'Tiler')->assertStatus(409);
    }

    public function test_each_agency_sees_only_its_own_candidates_while_the_coordinator_sees_all(): void
    {
        Agency::create([
            'id' => 'AG-9002',
            'name' => 'Daham Lanka',
            'code' => 'DAH-9002',
            'address' => '5 Hill Street, Kandy',
            'username' => 'daham.owner',
            'contact' => 'Nimal Silva',
            'email' => 'owner@daham.lk',
            'status' => 'active',
        ]);

        $daham = User::create([
            'name' => 'Nimal Silva',
            'username' => 'daham.owner',
            'email' => 'owner@daham.lk',
            'phone' => '0712000002',
            'password_hash' => password_hash('Passw0rd1', PASSWORD_BCRYPT),
            'role_slug' => 'agency_owner',
            'agency_id' => 'AG-9002',
            'status' => 'active',
        ]);

        $theirs = Candidate::create([
            'agency_id' => 'AG-9002',
            'name' => 'Sunil Bandara',
            'passport_no' => 'N5544332',
            'address' => '9 Lake Road, Kandy',
            'mobile' => '0779998888',
            'status' => 'draft',
        ]);

        // Solidrow sees its own file and nobody else's.
        $this->as($this->agencyToken)->getJson('/api/v1/candidates')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Kamal Perera');
        $this->getJson('/api/v1/candidates/'.$theirs->id)->assertStatus(403);

        // Daham Lanka likewise.
        $this->as(Jwt::sign($daham->toPublic()))->getJson('/api/v1/candidates')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Sunil Bandara');

        // The foreign agent works across both.
        $this->as($this->coordinator)->getJson('/api/v1/candidates?agencyId=all')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }
}
