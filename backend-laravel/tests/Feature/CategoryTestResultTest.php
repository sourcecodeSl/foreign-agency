<?php

namespace Tests\Feature;

use App\Models\Agency;
use App\Models\JobRole;
use App\Models\User;
use App\Support\Jwt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A local agency puts a candidate up in several job categories for one
 * foreign company. The company records a result per category - a fail as
 * much as a pass - and the local agency reads each one. A pass makes the
 * category the profession, and the same person's registrations with other
 * companies can then be blocked.
 */
class CategoryTestResultTest extends TestCase
{
    use RefreshDatabase;

    private int $phones = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
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

    private function register(string $token, string $company, array $roles, string $passport = 'N1122334', string $nic = '901234567V'): array
    {
        return $this->as($token)->postJson('/api/v1/candidates', [
            'firstName' => 'Nimal',
            'lastName' => 'Silva',
            'fatherName' => 'Sunil Silva',
            'passportNo' => $passport,
            'nicNo' => $nic,
            'address' => '9 Lake Road, Kandy',
            'mobile' => '0779998887',
            'companyAgencyId' => $company,
            'jobRoleIds' => array_map(fn ($r) => $this->roleId($r), $roles),
        ])->assertCreated()->json('data.candidate');
    }

    public function test_each_category_gets_its_own_result_and_the_local_agency_is_told(): void
    {
        $local = $this->agency('AG-9001', 'Solidrow');
        $company = $this->agency('AG-9100', 'Herzl Construction', 'foreign');

        $candidate = $this->register($local, 'AG-9100', ['Tiler', 'Mason']);

        // The local agency adds another category later, on the same file.
        $this->as($local)->putJson('/api/v1/candidates/'.$candidate['id'], [
            'jobRoleIds' => [$this->roleId('Tiler'), $this->roleId('Mason'), $this->roleId('Welder')],
        ])->assertOk()->assertJsonCount(3, 'data.jobRoles');

        // A fail must name its category too.
        $this->as($company)->patchJson('/api/v1/candidates/'.$candidate['id'].'/test-result', ['result' => 'fail'])
            ->assertStatus(422);

        // A category not on the file is refused.
        $this->patchJson('/api/v1/candidates/'.$candidate['id'].'/test-result', [
            'result' => 'pass',
            'jobRoleId' => $this->roleId('Plumber'),
        ])->assertStatus(422);

        // Tiler fails: back in the pool, the other categories still open.
        $this->patchJson('/api/v1/candidates/'.$candidate['id'].'/test-result', [
            'result' => 'fail',
            'jobRoleId' => $this->roleId('Tiler'),
            'note' => 'Cutting not accurate enough',
        ])->assertOk()->assertJsonPath('data.poolStatus', 'pool');

        // The company cannot flip the pass on without naming the category.
        $this->patchJson('/api/v1/candidates/'.$candidate['id'].'/pass', ['passed' => true])->assertStatus(422);

        // Mason passes: that becomes the profession.
        $this->patchJson('/api/v1/candidates/'.$candidate['id'].'/test-result', [
            'result' => 'pass',
            'jobRoleId' => $this->roleId('Mason'),
        ])->assertOk()
            ->assertJsonPath('data.profession', 'Mason')
            ->assertJsonPath('data.poolStatus', 'passed');

        // Once passed, no other category can be recorded.
        $this->patchJson('/api/v1/candidates/'.$candidate['id'].'/test-result', [
            'result' => 'pass',
            'jobRoleId' => $this->roleId('Welder'),
        ])->assertStatus(409);

        // The local agency reads both results, by category.
        $file = $this->as($local)->getJson('/api/v1/candidates/'.$candidate['id'])->assertOk()->json('data');
        $results = collect($file['categoryResults'])->keyBy('jobRole');
        $this->assertSame('fail', $results['Tiler']['result']);
        $this->assertSame('Cutting not accurate enough', $results['Tiler']['note']);
        $this->assertSame('pass', $results['Mason']['result']);
        $this->assertSame('Herzl Construction', $results['Mason']['company']['name']);

        // A category with a result stays on the file whatever the edit says.
        $this->putJson('/api/v1/candidates/'.$candidate['id'], ['jobRoleIds' => [$this->roleId('Welder')]])
            ->assertOk();
        $this->assertEqualsCanonicalizing(
            ['Tiler', 'Mason', 'Welder'],
            array_column($this->getJson('/api/v1/candidates/'.$candidate['id'])->json('data.jobRoles'), 'name')
        );

        // And the bell says so, fail and pass alike.
        $titles = array_column($this->getJson('/api/v1/notifications')->assertOk()->json('data'), 'title');
        $this->assertContains('Nimal Silva did not pass as Tiler', $titles);
        $this->assertContains('Nimal Silva passed as Mason', $titles);
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

        // Not for another company, by the agency that holds them...
        $this->as($local)->putJson('/api/v1/candidates/'.$candidate['id'], ['companyAgencyId' => 'AG-9101'])
            ->assertStatus(409);

        // ...nor by any other agency, known by NIC.
        $this->as($other)->postJson('/api/v1/candidates', [
            'firstName' => 'Nimal',
            'lastName' => 'Silva',
            'passportNo' => 'N5566778',
            'nicNo' => '901234567V',
            'address' => '9 Lake Road, Kandy',
            'mobile' => '0779998887',
            'companyAgencyId' => 'AG-9101',
            'jobRoleIds' => [$this->roleId('Mason')],
        ])->assertStatus(409);
    }

    public function test_registrations_with_other_companies_show_on_the_profile_and_can_be_blocked(): void
    {
        $local = $this->agency('AG-9001', 'Solidrow');
        $other = $this->agency('AG-9002', 'Lanka Jobs');
        $company = $this->agency('AG-9100', 'Herzl Construction', 'foreign');
        $negev = $this->agency('AG-9101', 'Negev Builders', 'foreign');

        // The same person, registered by two agencies for two companies.
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

    public function test_a_candidate_is_registered_with_several_companies_until_one_passes(): void
    {
        $local = $this->agency('AG-9001', 'Solidrow');
        $herzl = $this->agency('AG-9100', 'Herzl Construction', 'foreign');
        $negev = $this->agency('AG-9101', 'Negev Builders', 'foreign');
        $this->agency('AG-9102', 'Galil Works', 'foreign');

        $candidate = $this->register($local, 'AG-9100', ['Tiler']);
        $url = '/api/v1/candidates/'.$candidate['id'];

        // Another company, for its own categories, on the same file.
        $this->as($local)->postJson($url.'/registrations', [
            'companyAgencyId' => 'AG-9101',
            'jobRoleIds' => [$this->roleId('Mason'), $this->roleId('Welder')],
        ])->assertCreated()->assertJsonCount(2, 'data.registrations');

        // Once per company.
        $this->postJson($url.'/registrations', [
            'companyAgencyId' => 'AG-9100',
            'jobRoleIds' => [$this->roleId('Mason')],
        ])->assertStatus(409);

        // A third one, taken off again while it has recorded nothing.
        $galil = $this->postJson($url.'/registrations', [
            'companyAgencyId' => 'AG-9102',
            'jobRoleIds' => [$this->roleId('Painter')],
        ])->assertCreated()->json('data.registrations.2.id');
        $this->deleteJson($url.'/registrations/'.$galil)->assertOk()->assertJsonCount(2, 'data.registrations');

        // Each company lists them, with its own categories.
        $row = $this->as($negev)->getJson('/api/v1/candidates')->assertOk()->json('data.0');
        $this->assertSame(['Mason', 'Welder'], array_column($row['registration']['jobRoles'], 'name'));
        $this->getJson($url)->assertOk();

        // A company records only in the categories it was given.
        $this->as($herzl)->patchJson($url.'/test-result', ['result' => 'pass', 'jobRoleId' => $this->roleId('Mason')])
            ->assertStatus(422);
        $this->patchJson($url.'/test-result', ['result' => 'fail', 'jobRoleId' => $this->roleId('Tiler')])
            ->assertOk()->assertJsonPath('data.poolStatus', 'pool');

        // A company that recorded something stays on the file.
        $herzlRegistration = collect($this->as($local)->getJson($url)->json('data.registrations'))
            ->firstWhere('company.id', 'AG-9100')['id'];
        $this->deleteJson($url.'/registrations/'.$herzlRegistration)->assertStatus(409);

        // Negev passes them as a Mason: they belong to Negev now.
        $passed = $this->as($negev)->patchJson($url.'/test-result', ['result' => 'pass', 'jobRoleId' => $this->roleId('Mason')])
            ->assertOk()
            ->assertJsonPath('data.profession', 'Mason')
            ->assertJsonPath('data.company.id', 'AG-9101')
            ->json('data.registrations');
        $states = collect($passed)->pluck('state', 'company.id');
        $this->assertSame('void', $states['AG-9100']);
        $this->assertSame('passed', $states['AG-9101']);

        // Herzl's registration is no longer valid...
        $this->as($herzl)->patchJson($url.'/test-result', ['result' => 'pass', 'jobRoleId' => $this->roleId('Tiler')])
            ->assertStatus(409);

        // ...and no company can be added any more.
        $this->as($local)->postJson($url.'/registrations', [
            'companyAgencyId' => 'AG-9102',
            'jobRoleIds' => [$this->roleId('Painter')],
        ])->assertStatus(409);
    }
}
