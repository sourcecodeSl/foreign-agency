<?php

namespace Tests\Feature;

use App\Models\Agency;
use App\Models\Candidate;
use App\Models\CandidateRegistration;
use App\Models\JobRole;
use App\Models\User;
use App\Support\Jwt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A local agency registers a candidate with the job categories they can do.
 * A coordinator or the Main Admin assigns the foreign company and the
 * categories it tests, which issues the test index numbers; they move the
 * candidate to another company, or send them for a new test after a fail,
 * and every assignment stays in the history. The company records a result
 * per category - a fail as much as a pass - and the local agency reads each.
 */
class CategoryTestResultTest extends TestCase
{
    use RefreshDatabase;

    private int $phones = 0;

    private string $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        $this->admin = Jwt::sign(User::where('role_slug', 'main_admin')->firstOrFail()->toPublic());
    }

    private function agency(string $id, string $name, string $type = 'local'): string
    {
        Agency::create([
            'id' => $id,
            'name' => $name,
            'code' => strtoupper(substr($name, 0, 3)).'-'.substr($id, 3),
            'type' => $type,
            'country' => $type === 'foreign' ? 'Israel' : null,
            'address' => '1 Main Street, Colombo',
            'username' => strtolower($id).'.owner',
            'contact' => $name.' Owner',
            'email' => strtolower($id).'@example.com',
            'status' => 'active',
        ]);

        $owner = User::create([
            'name' => $name.' Owner',
            'username' => strtolower($id).'.owner',
            'email' => strtolower($id).'@example.com',
            'phone' => '07120000'.str_pad((string) ++$this->phones, 2, '0', STR_PAD_LEFT),
            'password_hash' => password_hash('Passw0rd1', PASSWORD_BCRYPT),
            'role_slug' => 'agency_owner',
            'agency_id' => $id,
            'status' => 'active',
        ]);

        return Jwt::sign($owner->toPublic());
    }

    private function as(string $token)
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken($token);
    }

    private function roleId(string $name): int
    {
        return (int) JobRole::where('name', $name)->firstOrFail()->id;
    }

    private function roleIds(array $names): array
    {
        return array_map(fn ($name) => $this->roleId($name), $names);
    }

    /** Registered by the agency with what the candidate can do; no company. */
    private function registerByAgency(string $token, array $roles, string $passport = 'N1122334', string $nic = '901234567V'): array
    {
        return $this->as($token)->postJson('/api/v1/candidates', [
            'firstName' => 'Nimal',
            'lastName' => 'Silva',
            'fatherName' => 'Sunil Silva',
            'passportNo' => $passport,
            'nicNo' => $nic,
            'address' => '9 Lake Road, Kandy',
            'mobile' => '0779998887',
            'jobRoleIds' => $this->roleIds($roles),
        ])->assertCreated()->json('data.candidate');
    }

    /** The admin side sends the candidate to a company's test. */
    private function assign(int $candidateId, string $company, array $roles, array $extra = [])
    {
        return $this->as($this->admin)->postJson('/api/v1/candidates/'.$candidateId.'/registrations', $extra + [
            'companyAgencyId' => $company,
            'jobRoleIds' => $this->roleIds($roles),
        ]);
    }

    /** Registered by the agency and assigned by the admin side, as the company then finds it. */
    private function register(string $token, string $company, array $roles, string $passport = 'N1122334', string $nic = '901234567V'): array
    {
        $candidate = $this->registerByAgency($token, $roles, $passport, $nic);
        $this->assign($candidate['id'], $company, $roles)->assertCreated();

        return $this->as($token)->getJson('/api/v1/candidates/'.$candidate['id'])->assertOk()->json('data');
    }

    public function test_the_agency_registers_without_a_company_and_the_admin_side_assigns_it(): void
    {
        $local = $this->agency('AG-9001', 'Solidrow');
        $company = $this->agency('AG-9100', 'Herzl Construction', 'foreign');

        // A company sent by the agency is not taken: that is the admin side's call.
        $candidate = $this->as($local)->postJson('/api/v1/candidates', [
            'firstName' => 'Nimal',
            'lastName' => 'Silva',
            'passportNo' => 'N1122334',
            'nicNo' => '901234567V',
            'address' => '9 Lake Road, Kandy',
            'mobile' => '0779998887',
            'companyAgencyId' => 'AG-9100',
            'jobRoleIds' => $this->roleIds(['Tiler', 'Mason']),
        ])->assertCreated()
            ->assertJsonPath('data.candidate.company', null)
            ->assertJsonCount(0, 'data.candidate.registrations')
            ->assertJsonCount(2, 'data.candidate.jobRoles')
            ->json('data.candidate');
        $url = '/api/v1/candidates/'.$candidate['id'];

        // Nor can the agency assign or change one afterwards.
        $this->postJson($url.'/registrations', ['companyAgencyId' => 'AG-9100', 'jobRoleIds' => $this->roleIds(['Tiler'])])
            ->assertStatus(403);
        $this->putJson($url, ['companyAgencyId' => 'AG-9100'])->assertOk()->assertJsonPath('data.company', null);

        // Nobody reaches the company yet; the admin side sees who waits for one.
        $this->as($company)->getJson('/api/v1/candidates')->assertOk()->assertJsonCount(0, 'data');
        $this->as($this->admin)->getJson('/api/v1/candidate-assignments/waiting')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.candidate.name', 'Nimal Silva')
            ->assertJsonPath('data.0.agencyName', 'Solidrow')
            ->assertJsonPath('data.0.candidate.jobRoles.1.name', 'Mason')
            ->assertJsonMissingPath('data.0.candidate.mobile');
        // The agency does not read that list.
        $this->as($local)->getJson('/api/v1/candidate-assignments/waiting')->assertStatus(403);

        // Assigned, for the categories chosen: the numbers come out at once.
        $this->assign($candidate['id'], 'AG-9100', ['Tiler'])
            ->assertCreated()
            ->assertJsonPath('data.company.id', 'AG-9100')
            ->assertJsonPath('data.registrations.0.approval', 'approved')
            ->assertJsonPath('data.registrations.0.jobRoles.0.testIndexNo', 'TL00001');
        $this->getJson('/api/v1/candidate-assignments/waiting')->assertOk()->assertJsonCount(0, 'data');

        // The admin side adds a category to it later: it gets its number too.
        $registrationId = $this->getJson($url)->json('data.registrations.0.id');
        $this->putJson($url.'/registrations/'.$registrationId, ['jobRoleIds' => $this->roleIds(['Tiler', 'Mason'])])
            ->assertOk()->assertJsonPath('data.registrations.0.jobRoles.1.testIndexNo', 'MS00001');
        // The agency cannot change them.
        $this->as($local)->putJson($url.'/registrations/'.$registrationId, ['jobRoleIds' => $this->roleIds(['Tiler'])])
            ->assertStatus(403);

        // The company has them on its list now, and the agency sees the numbers.
        $this->as($company)->getJson('/api/v1/candidates')->assertOk()->assertJsonCount(1, 'data');
        $this->as($local)->getJson($url)->assertJsonPath('data.registrations.0.jobRoles.0.testIndexNo', 'TL00001');

        // And the agency's bell says so.
        $titles = array_column($this->getJson('/api/v1/notifications')->assertOk()->json('data'), 'title');
        $this->assertContains('Nimal Silva is assigned to Herzl Construction', $titles);
    }

    public function test_each_category_gets_its_own_result_and_the_local_agency_is_told(): void
    {
        $local = $this->agency('AG-9001', 'Solidrow');
        $company = $this->agency('AG-9100', 'Herzl Construction', 'foreign');

        $candidate = $this->register($local, 'AG-9100', ['Tiler', 'Mason', 'Welder']);
        $url = '/api/v1/candidates/'.$candidate['id'];

        // A fail must name its category too.
        $this->as($company)->patchJson($url.'/test-result', ['result' => 'fail'])->assertStatus(422);

        // A category it was not given is refused.
        $this->patchJson($url.'/test-result', ['result' => 'pass', 'jobRoleId' => $this->roleId('Plumber')])->assertStatus(422);

        // Tiler fails: back in the pool, the other categories still open.
        $this->patchJson($url.'/test-result', [
            'result' => 'fail',
            'jobRoleId' => $this->roleId('Tiler'),
            'note' => 'Cutting not accurate enough',
        ])->assertOk()->assertJsonPath('data.poolStatus', 'pool');

        // The company cannot flip the pass on without naming the category.
        $this->patchJson($url.'/pass', ['passed' => true])->assertStatus(422);

        // Mason passes: that becomes the profession.
        $this->patchJson($url.'/test-result', ['result' => 'pass', 'jobRoleId' => $this->roleId('Mason')])
            ->assertOk()
            ->assertJsonPath('data.profession', 'Mason')
            ->assertJsonPath('data.poolStatus', 'passed');

        // Once passed, no other category can be recorded.
        $this->patchJson($url.'/test-result', ['result' => 'pass', 'jobRoleId' => $this->roleId('Welder')])->assertStatus(409);

        // The local agency reads both results, by category.
        $file = $this->as($local)->getJson($url)->assertOk()->json('data');
        $results = collect($file['categoryResults'])->keyBy('jobRole');
        $this->assertSame('fail', $results['Tiler']['result']);
        $this->assertSame('Cutting not accurate enough', $results['Tiler']['note']);
        $this->assertSame('pass', $results['Mason']['result']);
        $this->assertSame('Herzl Construction', $results['Mason']['company']['name']);

        // The agency's own list keeps a category with a result, whatever its edit says.
        $this->putJson($url, ['jobRoleIds' => [$this->roleId('Welder')]])->assertOk();
        $this->assertEqualsCanonicalizing(
            ['Tiler', 'Mason', 'Welder'],
            array_column($this->getJson($url)->json('data.jobRoles'), 'name')
        );

        // And the bell says so, fail and pass alike.
        $titles = array_column($this->getJson('/api/v1/notifications')->assertOk()->json('data'), 'title');
        $this->assertContains('Nimal Silva did not pass as Tiler', $titles);
        $this->assertContains('Nimal Silva passed as Mason', $titles);
    }

    public function test_a_candidate_moves_to_another_company_and_the_first_stays_in_the_history(): void
    {
        $local = $this->agency('AG-9001', 'Solidrow');
        $herzl = $this->agency('AG-9100', 'Herzl Construction', 'foreign');
        $negev = $this->agency('AG-9101', 'Negev Builders', 'foreign');

        $candidate = $this->register($local, 'AG-9100', ['Tiler']);
        $url = '/api/v1/candidates/'.$candidate['id'];
        $first = $candidate['registrations'][0]['id'];

        // One current assignment per company: a second one is refused.
        $this->assign($candidate['id'], 'AG-9100', ['Mason'])->assertStatus(409);

        // Moved to Negev instead, with a category of its own: new numbers.
        $this->assign($candidate['id'], 'AG-9101', ['Tiler', 'Mason'], ['replacesRegistrationId' => $first, 'reason' => 'moved'])
            ->assertCreated()
            ->assertJsonPath('data.company.id', 'AG-9101')
            ->assertJsonPath('data.registrations.0.state', 'ended')
            ->assertJsonPath('data.registrations.0.current', false)
            ->assertJsonPath('data.registrations.0.ended.reason', 'moved')
            ->assertJsonPath('data.registrations.0.jobRoles.0.testIndexNo', 'TL00001')
            ->assertJsonPath('data.registrations.1.current', true)
            ->assertJsonPath('data.registrations.1.jobRoles.0.testIndexNo', 'TL00002')
            ->assertJsonPath('data.registrations.1.jobRoles.1.testIndexNo', 'MS00001');

        // Herzl no longer has them; Negev does.
        $this->as($herzl)->getJson('/api/v1/candidates')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson($url)->assertStatus(403);
        $this->as($negev)->getJson('/api/v1/candidates')->assertOk()->assertJsonCount(1, 'data');

        // An ended assignment is history: not edited, not removed.
        $this->as($this->admin)->putJson($url.'/registrations/'.$first, ['jobRoleIds' => $this->roleIds(['Mason'])])->assertStatus(409);
        $this->deleteJson($url.'/registrations/'.$first)->assertStatus(409);
        $this->assign($candidate['id'], 'AG-9100', ['Tiler'], ['replacesRegistrationId' => $first, 'reason' => 'moved'])->assertStatus(409);
    }

    public function test_after_a_fail_the_candidate_is_sent_for_a_new_test_with_new_numbers(): void
    {
        $local = $this->agency('AG-9001', 'Solidrow');
        $herzl = $this->agency('AG-9100', 'Herzl Construction', 'foreign');

        $candidate = $this->register($local, 'AG-9100', ['Tiler']);
        $url = '/api/v1/candidates/'.$candidate['id'];
        $first = $candidate['registrations'][0]['id'];

        $this->as($herzl)->patchJson($url.'/test-result', ['result' => 'fail', 'jobRoleId' => $this->roleId('Tiler')])->assertOk();

        // The same company tests them again, under a new number.
        $this->assign($candidate['id'], 'AG-9100', ['Tiler'], ['replacesRegistrationId' => $first, 'reason' => 'new_test'])
            ->assertCreated()
            ->assertJsonPath('data.registrations.0.ended.reason', 'new_test')
            ->assertJsonPath('data.registrations.0.results.0.result', 'fail')
            ->assertJsonPath('data.registrations.1.jobRoles.0.testIndexNo', 'TL00002')
            ->assertJsonCount(0, 'data.registrations.1.results');

        // The company's list shows the new test, not the one before.
        $this->as($herzl)->getJson('/api/v1/candidates')->assertOk()
            ->assertJsonPath('data.0.registration.jobRoles.0.testIndexNo', 'TL00002');

        // This time they pass - recorded against the new test, the fail kept.
        $this->as($herzl)->patchJson($url.'/test-result', ['result' => 'pass', 'jobRoleId' => $this->roleId('Tiler')])
            ->assertOk()
            ->assertJsonPath('data.poolStatus', 'passed')
            ->assertJsonPath('data.registrations.0.results.0.result', 'fail')
            ->assertJsonPath('data.registrations.1.results.0.result', 'pass')
            ->assertJsonPath('data.registrations.1.state', 'passed');

        // Passed, nobody is moved or sent for another test.
        $second = $this->as($this->admin)->getJson($url)->json('data.registrations.1.id');
        $this->assign($candidate['id'], 'AG-9100', ['Tiler'], ['replacesRegistrationId' => $second, 'reason' => 'new_test'])
            ->assertStatus(409);
    }

    public function test_the_history_report_lists_every_company_test_and_result(): void
    {
        $local = $this->agency('AG-9001', 'Solidrow');
        $herzl = $this->agency('AG-9100', 'Herzl Construction', 'foreign');
        $negev = $this->agency('AG-9101', 'Negev Builders', 'foreign');

        $candidate = $this->register($local, 'AG-9100', ['Tiler']);
        $url = '/api/v1/candidates/'.$candidate['id'];

        $this->as($herzl)->patchJson($url.'/test-result', ['result' => 'fail', 'jobRoleId' => $this->roleId('Tiler'), 'note' => 'Uneven joints'])->assertOk();
        $this->assign($candidate['id'], 'AG-9101', ['Mason'], [
            'replacesRegistrationId' => $candidate['registrations'][0]['id'],
            'reason' => 'new_test',
        ])->assertCreated();
        $this->as($negev)->patchJson($url.'/test-result', ['result' => 'pass', 'jobRoleId' => $this->roleId('Mason')])->assertOk();

        $report = $this->as($this->admin)->getJson($url.'/history')->assertOk()->json('data');

        $this->assertSame('Nimal Silva', $report['candidate']['name']);
        $this->assertSame('Solidrow', $report['agency']['name']);
        $this->assertNull($report['candidate']['mobile']);
        $this->assertCount(2, $report['assignments']);

        [$first, $second] = $report['assignments'];
        $this->assertSame('Herzl Construction', $first['company']['name']);
        $this->assertSame('new_test', $first['ended']['reason']);
        $this->assertSame([['jobRole' => 'Tiler', 'testIndexNo' => 'TL00001', 'result' => 'fail', 'note' => 'Uneven joints']],
            array_map(fn ($t) => array_intersect_key($t, array_flip(['jobRole', 'testIndexNo', 'result', 'note'])), $first['tests']));
        $this->assertNotNull($first['tests'][0]['resultAt']);
        $this->assertSame('Herzl Construction Owner', $first['tests'][0]['recordedBy']);

        $this->assertSame('Negev Builders', $second['company']['name']);
        $this->assertNull($second['ended']);
        $this->assertSame('passed', $second['state']);
        $this->assertSame('MS00001', $second['tests'][0]['testIndexNo']);
        $this->assertSame('pass', $second['tests'][0]['result']);

        // For the admin side only.
        $this->as($local)->getJson($url.'/history')->assertStatus(403);
        $this->as($negev)->getJson($url.'/history')->assertStatus(403);
    }

    public function test_a_passed_candidate_cannot_move_to_another_company_or_agency(): void
    {
        $local = $this->agency('AG-9001', 'Solidrow');
        $other = $this->agency('AG-9002', 'Lanka Jobs');
        $company = $this->agency('AG-9100', 'Herzl Construction', 'foreign');
        $this->agency('AG-9101', 'Negev Builders', 'foreign');

        $candidate = $this->register($local, 'AG-9100', ['Mason']);

        $this->as($company)->patchJson('/api/v1/candidates/'.$candidate['id'].'/test-result', [
            'result' => 'pass',
            'jobRoleId' => $this->roleId('Mason'),
        ])->assertOk();

        // Not for another company, by the admin side...
        $this->as($this->admin)->putJson('/api/v1/candidates/'.$candidate['id'], ['companyAgencyId' => 'AG-9101'])
            ->assertStatus(409);
        $this->assign($candidate['id'], 'AG-9101', ['Mason'])->assertStatus(409);

        // ...nor by any other agency, known by NIC.
        $this->as($other)->postJson('/api/v1/candidates', [
            'firstName' => 'Nimal',
            'lastName' => 'Silva',
            'passportNo' => 'N5566778',
            'nicNo' => '901234567V',
            'address' => '9 Lake Road, Kandy',
            'mobile' => '0779998887',
            'jobRoleIds' => [$this->roleId('Mason')],
        ])->assertStatus(409);
    }

    public function test_registrations_with_other_companies_show_on_the_profile_and_can_be_blocked(): void
    {
        $local = $this->agency('AG-9001', 'Solidrow');
        $other = $this->agency('AG-9002', 'Lanka Jobs');
        $company = $this->agency('AG-9100', 'Herzl Construction', 'foreign');
        $negev = $this->agency('AG-9101', 'Negev Builders', 'foreign');

        // The same person, registered by two agencies, assigned to two companies.
        $here = $this->register($local, 'AG-9100', ['Mason']);
        $there = $this->register($other, 'AG-9101', ['Mason', 'Tiler'], 'N5566778');

        // Before anyone passes, nothing is listed and nothing can be blocked.
        $this->as($company)->patchJson('/api/v1/candidates/'.$here['id'].'/other-registrations/'.$there['id'], ['blocked' => true])
            ->assertStatus(409);

        $this->patchJson('/api/v1/candidates/'.$here['id'].'/test-result', [
            'result' => 'pass',
            'jobRoleId' => $this->roleId('Mason'),
        ])->assertOk()->assertJsonPath('data.otherRegistrations.0.company.name', 'Negev Builders');

        // The passed profile names the other company, for the local agency too.
        $this->as($local)->getJson('/api/v1/candidates/'.$here['id'])->assertOk()
            ->assertJsonPath('data.otherRegistrations.0.company.name', 'Negev Builders')
            ->assertJsonPath('data.otherRegistrations.0.blocked', false)
            ->assertJsonPath('data.otherRegistrations.0.agencyName', null);

        // The local agency does not block; the company holding the pass does.
        $this->patchJson('/api/v1/candidates/'.$here['id'].'/other-registrations/'.$there['id'], ['blocked' => true])
            ->assertForbidden();
        $this->as($company)->patchJson('/api/v1/candidates/'.$here['id'].'/other-registrations/'.$there['id'], ['blocked' => true])
            ->assertOk()->assertJsonPath('data.0.blocked', true);

        // The other company can record nothing on the blocked registration.
        $this->as($negev)->patchJson('/api/v1/candidates/'.$there['id'].'/test-result', [
            'result' => 'fail',
            'jobRoleId' => $this->roleId('Tiler'),
        ])->assertStatus(409);
        $this->getJson('/api/v1/candidates')->assertOk()
            ->assertJsonPath('data.0.blocked', true)
            ->assertJsonPath('data.0.registrationBlocked.company', 'Herzl Construction');

        // An unrelated file cannot be reached through this route.
        $stranger = $this->register($other, 'AG-9101', ['Tiler'], 'N9999999', '851234567V');
        $this->as($company)->patchJson('/api/v1/candidates/'.$here['id'].'/other-registrations/'.$stranger['id'], ['blocked' => true])
            ->assertNotFound();

        // And the block can be lifted again.
        $this->patchJson('/api/v1/candidates/'.$here['id'].'/other-registrations/'.$there['id'], ['blocked' => false])
            ->assertOk()->assertJsonPath('data.0.blocked', false);
    }

    public function test_each_category_gets_its_own_test_index_number_and_it_finds_the_candidate(): void
    {
        $local = $this->agency('AG-9001', 'Solidrow');
        $company = $this->agency('AG-9100', 'Herzl Construction', 'foreign');

        $first = $this->register($local, 'AG-9100', ['Tiler', 'Plumber']);
        $this->assertSame(['TL00001', 'PL00001'], array_column($first['registrations'][0]['jobRoles'], 'testIndexNo'));

        // The next person in the same trade takes the next number.
        $second = $this->register($local, 'AG-9100', ['Tiler'], 'N5566778', '911234567V');
        $this->assertSame('TL00002', $second['registrations'][0]['jobRoles'][0]['testIndexNo']);

        // The company finds them by index number or NIC.
        $this->as($company)->getJson('/api/v1/candidates?search=PL00001')
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $first['id']);
        $this->getJson('/api/v1/candidates?search=911234567')
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $second['id']);
    }

    public function test_a_test_index_number_is_never_given_to_anybody_else(): void
    {
        $local = $this->agency('AG-9001', 'Solidrow');
        $this->agency('AG-9100', 'Herzl Construction', 'foreign');

        $first = $this->register($local, 'AG-9100', ['Tiler', 'Plumber']);

        // Plumber taken off: PL00001 goes with it and is not handed out again.
        $this->as($this->admin)->putJson('/api/v1/candidates/'.$first['id'].'/registrations/'.$first['registrations'][0]['id'], [
            'jobRoleIds' => [$this->roleId('Tiler')],
        ])->assertOk();

        $second = $this->register($local, 'AG-9100', ['Plumber'], 'N5566778', '911234567V');
        $this->assertSame('PL00002', $second['registrations'][0]['jobRoles'][0]['testIndexNo']);

        // And the database itself refuses a number that is already held.
        $this->expectException(\Illuminate\Database\QueryException::class);
        \Illuminate\Support\Facades\DB::table('candidate_registration_roles')
            ->where('test_index_no', 'PL00002')
            ->update(['test_index_no' => 'TL00001']);
    }

    public function test_a_result_is_recorded_without_the_test_results(): void
    {
        $local = $this->agency('AG-9001', 'Solidrow');
        $company = $this->agency('AG-9100', 'Herzl Construction', 'foreign');
        $candidate = $this->register($local, 'AG-9100', ['Tiler']);

        // Only the category and pass or fail; the note is optional too.
        $this->as($company)->patchJson('/api/v1/candidates/'.$candidate['id'].'/test-result', [
            'result' => 'pass',
            'jobRoleId' => $this->roleId('Tiler'),
        ])->assertOk()->assertJsonPath('data.profession', 'Tiler');
    }

    public function test_only_the_registering_agency_is_asked_for_and_sees_the_mobile_and_email(): void
    {
        $local = $this->agency('AG-9001', 'Solidrow');
        $company = $this->agency('AG-9100', 'Herzl Construction', 'foreign');

        $candidate = $this->as($local)->postJson('/api/v1/candidates', [
            'firstName' => 'Nimal',
            'lastName' => 'Silva',
            'passportNo' => 'N1122334',
            'nicNo' => '901234567V',
            'address' => '9 Lake Road, Kandy',
            'mobile' => '0779998887',
            'email' => 'nimal@example.com',
            'jobRoleIds' => [$this->roleId('Tiler')],
        ])->assertCreated()->assertJsonPath('data.candidate.mobile', '0779998887')->json('data.candidate');
        $url = '/api/v1/candidates/'.$candidate['id'];
        $this->assign($candidate['id'], 'AG-9100', ['Tiler'])->assertCreated();

        // The agency itself sees it and finds the candidate by it.
        $this->as($local)->getJson($url)->assertJsonPath('data.mobile', '0779998887')->assertJsonPath('data.email', 'nimal@example.com');
        $this->getJson('/api/v1/candidates?search=0779998887')->assertJsonCount(1, 'data');

        // The admin side and the foreign company do not, not even by searching.
        foreach ([$this->admin, $company] as $token) {
            $this->as($token)->getJson($url)->assertOk()
                ->assertJsonPath('data.mobile', null)
                ->assertJsonPath('data.email', null)
                ->assertJsonPath('data.contactHidden', true);
        }
        $this->as($company)->getJson('/api/v1/candidates?search=0779998887')->assertJsonCount(0, 'data');

        // The police report is kept by the agency and the admin side, not the company.
        $this->as($company)->patchJson($url.'/police-report', ['status' => 'applied', 'referenceNo' => 'PR/1'])
            ->assertStatus(403);
        $this->as($this->admin)->patchJson($url.'/police-report', ['status' => 'applied', 'referenceNo' => 'PR/1'])
            ->assertOk();
        $this->as($local)->patchJson($url.'/police-report', ['status' => 'applied', 'referenceNo' => 'PR/2'])
            ->assertOk();
        $this->as($this->admin)->getJson('/api/v1/candidates?agencyId=all&search=0779998887')->assertJsonCount(0, 'data');

        // An edit from the admin side leaves the agency's number as it was.
        $this->putJson($url, ['mobile' => '0710000000', 'address' => '10 Lake Road, Kandy'])->assertOk();
        $this->assertSame('0779998887', Candidate::find($candidate['id'])->mobile);

        // Registering on the agency's behalf, no number is asked for or kept -
        // and the admin side may name the company there and then.
        $this->postJson('/api/v1/candidates', [
            'agencyId' => 'AG-9001',
            'firstName' => 'Sunil',
            'lastName' => 'Perera',
            'passportNo' => 'N5566778',
            'nicNo' => '911234567V',
            'address' => '3 Hill Street, Galle',
            'mobile' => '0712223334',
            'companyAgencyId' => 'AG-9100',
            'jobRoleIds' => [$this->roleId('Plumber')],
        ])->assertCreated()
            ->assertJsonPath('data.candidate.registrations.0.approval', 'approved')
            ->assertJsonPath('data.candidate.registrations.0.jobRoles.0.testIndexNo', 'PL00001');
        $this->assertNull(Candidate::where('passport_no', 'N5566778')->first()->mobile);

        // The agency itself still has to give one.
        $this->as($local)->postJson('/api/v1/candidates', [
            'firstName' => 'Kamal',
            'lastName' => 'Fernando',
            'passportNo' => 'N9988776',
            'nicNo' => '921234567V',
            'address' => '5 Sea Road, Negombo',
        ])->assertStatus(422)->assertJsonValidationErrors('mobile');
    }

    public function test_an_old_registration_an_agency_asked_for_gives_way_when_the_admin_side_assigns(): void
    {
        $local = $this->agency('AG-9001', 'Solidrow');
        $this->agency('AG-9100', 'Herzl Construction', 'foreign');
        $negev = $this->agency('AG-9101', 'Negev Builders', 'foreign');

        // As the agency could before: a company chosen, never approved.
        $candidate = $this->registerByAgency($local, ['Tiler']);
        Candidate::find($candidate['id'])->registerWith('AG-9100', $this->roleIds(['Tiler']));

        // Waiting for a company, with what was asked for to start from.
        $this->as($this->admin)->getJson('/api/v1/candidate-assignments/waiting')
            ->assertOk()->assertJsonPath('data.0.requested.company.id', 'AG-9100');

        // Assigned elsewhere: the request goes, nothing is left waiting.
        $this->assign($candidate['id'], 'AG-9101', ['Tiler'])
            ->assertCreated()
            ->assertJsonCount(1, 'data.registrations')
            ->assertJsonPath('data.registrations.0.company.id', 'AG-9101');
        $this->assertSame(0, CandidateRegistration::where('approval', CandidateRegistration::PENDING)->count());
        $this->as($negev)->getJson('/api/v1/candidates')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_the_admin_side_reads_a_companys_candidates_with_their_agency(): void
    {
        $local = $this->agency('AG-9001', 'Solidrow');
        $company = $this->agency('AG-9100', 'Herzl Construction', 'foreign');

        $this->register($local, 'AG-9100', ['Tiler']);
        $this->register($local, 'AG-9100', ['Mason'], 'N5566778', '911234567V');

        $listed = $this->as($this->admin)->getJson('/api/v1/candidates?agencyId=all&companyAgencyId=AG-9100')
            ->assertOk()->assertJsonCount(2, 'data')->json('data');
        $this->assertSame(['Solidrow', 'Solidrow'], array_column($listed, 'agencyName'));

        // The status filter narrows it like any other list.
        $this->getJson('/api/v1/candidates?agencyId=all&companyAgencyId=AG-9100&status=approved')
            ->assertOk()->assertJsonCount(0, 'data');

        $this->as($company)->getJson('/api/v1/candidates')->assertOk()->assertJsonCount(2, 'data');
    }
}
