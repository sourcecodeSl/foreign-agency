<?php

namespace Tests\Feature;

use App\Models\Agency;
use App\Models\JobRole;
use App\Models\User;
use App\Support\Jwt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Before a foreign company's final test, the local agency that registered the
 * candidate runs its own pre-test in each job category, under pre-test index
 * numbers of its own. Only a pass there lets the admin side send the
 * candidate to a company for that category; a fail may be sat again.
 */
class PreTestTest extends TestCase
{
    use RefreshDatabase;

    private int $phones = 0;

    private string $admin;

    private string $local;

    private string $otherLocal;

    private string $company;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        $this->admin = Jwt::sign(User::where('role_slug', 'main_admin')->firstOrFail()->toPublic());
        $this->local = $this->agency('AG-9001', 'Solidrow');
        $this->otherLocal = $this->agency('AG-9002', 'Harbour');
        $this->company = $this->agency('AG-9100', 'Herzl Construction', 'foreign');
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
            'phone' => '07140000'.str_pad((string) ++$this->phones, 2, '0', STR_PAD_LEFT),
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

    private function register(string $passport, string $nic, array $roles): int
    {
        return $this->as($this->local)->postJson('/api/v1/candidates', [
            'firstName' => 'Nimal',
            'lastName' => 'Silva',
            'passportNo' => $passport,
            'nicNo' => $nic,
            'address' => '9 Lake Road, Kandy',
            'mobile' => '0779998887',
            'jobRoleIds' => array_map(fn ($r) => $this->roleId($r), $roles),
        ])->assertCreated()->json('data.candidate.id');
    }

    private function assign(int $candidate, array $roles)
    {
        return $this->as($this->admin)->postJson('/api/v1/candidates/'.$candidate.'/registrations', [
            'companyAgencyId' => 'AG-9100',
            'jobRoleIds' => array_map(fn ($r) => $this->roleId($r), $roles),
        ]);
    }

    private function book(int $candidate, string $role)
    {
        return $this->as($this->local)->postJson('/api/v1/candidates/'.$candidate.'/pre-tests', [
            'jobRoleId' => $this->roleId($role),
        ]);
    }

    private function record(int $candidate, int $test, string $result)
    {
        return $this->as($this->local)->patchJson('/api/v1/candidates/'.$candidate.'/pre-tests/'.$test, [
            'result' => $result,
        ]);
    }

    public function test_no_final_test_without_a_pre_test_pass_in_that_category(): void
    {
        $id = $this->register('N1122334', '901234567V', ['Tiler', 'Mason']);

        $this->assign($id, ['Tiler'])->assertStatus(422)
            ->assertJsonPath('message', 'Nimal Silva has not passed the pre-test for Tiler. '
                .'The local agency records a pre-test pass before the final test.');

        // Booked: its own index number, apart from the company's final ones.
        $test = $this->book($id, 'Tiler')->assertCreated()
            ->assertJsonPath('data.indexNo', 'PRE-TL00001')
            ->assertJsonPath('data.result', 'pending')
            ->json('data.id');
        $this->assign($id, ['Tiler'])->assertStatus(422);

        $this->record($id, $test, 'pass')->assertOk()->assertJsonPath('data.result', 'pass');

        // Passed in Tiler only: Mason still waits for its own pre-test.
        $this->assign($id, ['Tiler', 'Mason'])->assertStatus(422);
        $this->assign($id, ['Tiler'])->assertCreated()
            ->assertJsonPath('data.registrations.0.jobRoles.0.testIndexNo', 'TL00001');

        // Nor can Mason be added to that company's test later.
        $registration = $this->as($this->admin)->getJson('/api/v1/candidates/'.$id)->json('data.registrations.0.id');
        $this->as($this->admin)->putJson('/api/v1/candidates/'.$id.'/registrations/'.$registration, [
            'jobRoleIds' => [$this->roleId('Tiler'), $this->roleId('Mason')],
        ])->assertStatus(422);

        // A result once given is not overwritten; it is rewound first.
        $this->record($id, $test, 'fail')->assertStatus(409);
    }

    public function test_an_eligible_candidate_is_rewound_to_waiting(): void
    {
        $id = $this->register('N1122334', '901234567V', ['Tiler']);
        $test = $this->book($id, 'Tiler')->json('data.id');
        $rewind = fn () => $this->as($this->local)->postJson('/api/v1/candidates/'.$id.'/pre-tests/'.$test.'/rewind');

        // Nothing to rewind while it waits.
        $rewind()->assertStatus(409);

        $this->record($id, $test, 'pass')->assertOk();
        $this->as($this->local)->getJson('/api/v1/pre-tests?status=pass')->assertJsonCount(1, 'data.rows');

        $rewind()->assertOk()
            ->assertJsonPath('data.result', 'pending')
            ->assertJsonPath('data.indexNo', 'PRE-TL00001')
            ->assertJsonPath('message', 'Pre-test PRE-TL00001 for Nimal Silva in Tiler is waiting for its result again.');

        // Off the eligible list, and no longer sent to a company's final test.
        $this->as($this->local)->getJson('/api/v1/pre-tests?status=pass')->assertJsonCount(0, 'data.rows');
        $this->as($this->local)->getJson('/api/v1/pre-tests?status=pending')->assertJsonCount(1, 'data.rows');
        $this->assign($id, ['Tiler'])->assertStatus(422);

        // Only the agency itself rewinds.
        $this->record($id, $test, 'pass')->assertOk();
        $this->as($this->admin)->postJson('/api/v1/candidates/'.$id.'/pre-tests/'.$test.'/rewind')->assertForbidden();
        $this->as($this->otherLocal)->postJson('/api/v1/candidates/'.$id.'/pre-tests/'.$test.'/rewind')->assertForbidden();
    }

    public function test_passes_carried_over_take_the_next_index_numbers(): void
    {
        $id = $this->register('N1122334', '901234567V', ['Tiler', 'Mason']);
        // Passes from before pre-tests had no number.
        $this->passPreTests($id, [$this->roleId('Tiler'), $this->roleId('Mason')]);
        $this->book($this->register('N9988776', '911234567V', ['Tiler']), 'Tiler')
            ->assertJsonPath('data.indexNo', 'PRE-TL00001');

        \App\Models\CandidatePreTest::numberUnnumbered();

        $rows = collect($this->as($this->local)->getJson('/api/v1/pre-tests?status=pass')->json('data.rows'))
            ->keyBy('jobRole.name');
        $this->assertSame('PRE-TL00002', $rows['Tiler']['latest']['indexNo']);
        $this->assertSame('PRE-MS00001', $rows['Mason']['latest']['indexNo']);
    }

    public function test_a_fail_is_sat_again_under_a_new_number(): void
    {
        $id = $this->register('N1122334', '901234567V', ['Tiler']);
        $other = $this->register('N9988776', '911234567V', ['Tiler']);

        $first = $this->book($id, 'Tiler')->json('data.id');
        // One waits for its result: no second booking until then.
        $this->book($id, 'Tiler')->assertStatus(409);
        $this->book($other, 'Tiler')->assertCreated()->assertJsonPath('data.indexNo', 'PRE-TL00002');

        $this->record($id, $first, 'fail')->assertOk();
        $this->assign($id, ['Tiler'])->assertStatus(422);

        $retake = $this->book($id, 'Tiler')->assertCreated()->assertJsonPath('data.indexNo', 'PRE-TL00003')->json('data.id');
        // Only the latest attempt is recorded.
        $this->record($id, $first, 'pass')->assertStatus(409);
        $this->record($id, $retake, 'pass')->assertOk();
        $this->book($id, 'Tiler')->assertStatus(409);

        $this->assign($id, ['Tiler'])->assertCreated();

        $this->as($this->local)->getJson('/api/v1/candidates/'.$id.'/pre-tests')
            ->assertOk()
            ->assertJsonCount(2, 'data.attempts')
            ->assertJsonPath('data.summary.0.status', 'pass')
            ->assertJsonPath('data.summary.0.attempts', 2);
    }

    public function test_only_the_owning_local_agency_runs_the_pre_test(): void
    {
        $id = $this->register('N1122334', '901234567V', ['Tiler']);

        $this->as($this->admin)->postJson('/api/v1/candidates/'.$id.'/pre-tests', ['jobRoleId' => $this->roleId('Tiler')])
            ->assertForbidden();
        $this->as($this->company)->postJson('/api/v1/candidates/'.$id.'/pre-tests', ['jobRoleId' => $this->roleId('Tiler')])
            ->assertForbidden();
        $this->as($this->otherLocal)->postJson('/api/v1/candidates/'.$id.'/pre-tests', ['jobRoleId' => $this->roleId('Tiler')])
            ->assertForbidden();
        // Only a category on the candidate's file.
        $this->book($id, 'Mason')->assertStatus(422);
    }

    public function test_the_agency_page_lists_who_is_eligible_for_the_final_test(): void
    {
        $id = $this->register('N1122334', '901234567V', ['Tiler', 'Mason']);
        $this->register('N9988776', '911234567V', ['Plumber']);
        $test = $this->book($id, 'Tiler')->json('data.id');
        $this->record($id, $test, 'pass');
        $this->book($id, 'Mason');

        $this->as($this->local)->getJson('/api/v1/pre-tests')
            ->assertOk()
            ->assertJsonPath('data.counts.all', 3)
            ->assertJsonPath('data.counts.pass', 1)
            ->assertJsonPath('data.counts.pending', 1)
            ->assertJsonPath('data.counts.none', 1);

        $this->as($this->local)->getJson('/api/v1/pre-tests?status=pass')
            ->assertOk()
            ->assertJsonCount(1, 'data.rows')
            ->assertJsonPath('data.rows.0.jobRole.name', 'Tiler')
            ->assertJsonPath('data.rows.0.latest.indexNo', 'PRE-TL00001');

        // Another agency sees none of them; the admin side sees them all.
        $this->as($this->otherLocal)->getJson('/api/v1/pre-tests')->assertJsonPath('data.counts.all', 0);
        $this->as($this->admin)->getJson('/api/v1/pre-tests')->assertJsonPath('data.counts.all', 3);

        // The admin's waiting list shows where each category stands.
        $waiting = collect($this->as($this->admin)->getJson('/api/v1/candidate-assignments/waiting')->json('data'))
            ->firstWhere('id', $id);
        $this->assertSame(['pass', 'pending'], array_column($waiting['candidate']['preTests'], 'status'));
    }

    public function test_approving_an_agency_request_needs_the_pre_test_pass(): void
    {
        // Registered by the admin side with a company: a new file waits.
        $created = $this->as($this->admin)->postJson('/api/v1/candidates', [
            'agencyId' => 'AG-9001',
            'firstName' => 'Sunil',
            'lastName' => 'Perera',
            'passportNo' => 'N5566778',
            'nicNo' => '911234567V',
            'address' => '3 Hill Street, Galle',
            'companyAgencyId' => 'AG-9100',
            'jobRoleIds' => [$this->roleId('Plumber')],
        ])->assertCreated()->assertJsonPath('data.candidate.registrations.0.approval', 'pending')->json('data.candidate');

        $approve = fn () => $this->as($this->admin)->patchJson(
            '/api/v1/candidates/'.$created['id'].'/registrations/'.$created['registrations'][0]['id'].'/approval',
            ['decision' => 'approve']
        );
        $approve()->assertStatus(422);

        $test = $this->book($created['id'], 'Plumber')->json('data.id');
        $this->record($created['id'], $test, 'pass');
        $approve()->assertOk();
    }
}
