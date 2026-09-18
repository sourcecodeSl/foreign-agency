<?php

namespace Tests\Feature;

use App\Models\Agency;
use App\Models\Candidate;
use App\Models\JobRole;
use App\Models\User;
use App\Support\Jwt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A candidate is registered under a job category - the same trade list the
 * skill tests are booked against - and carries the agency's own test index
 * number.
 */
class CandidateJobCategoryTest extends TestCase
{
    use RefreshDatabase;

    private string $agency;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();

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

        $this->app['auth']->forgetGuards();
        $this->agency = Jwt::sign($owner->toPublic());
        $this->withToken($this->agency);
    }

    private function register(array $extra = [], string $passport = 'N7788990')
    {
        return $this->postJson('/api/v1/candidates', $extra + [
            'name' => 'Kamal Perera',
            'passportNo' => $passport,
            'nicNo' => substr(preg_replace('/\D/', '', $passport).'000000000', 0, 9).'V',
            'address' => '12 Temple Road, Negombo',
            'mobile' => '0771234567',
        ]);
    }

    private function roleId(string $name): int
    {
        return (int) JobRole::where('name', $name)->firstOrFail()->id;
    }

    public function test_a_candidate_is_registered_under_a_job_category_with_a_test_index(): void
    {
        $tiler = $this->roleId('Tiler');

        $candidate = $this->register(['jobRoleId' => $tiler, 'testIndexNo' => 'TI-2026-0148'])
            ->assertCreated()
            ->assertJsonPath('data.candidate.jobRole', 'Tiler')
            ->assertJsonPath('data.candidate.jobRoleId', $tiler)
            ->assertJsonPath('data.candidate.testIndexNo', 'TI-2026-0148')
            ->json('data.candidate');

        $row = Candidate::findOrFail($candidate['id']);
        $this->assertSame($tiler, (int) $row->job_role_id);
        $this->assertSame('TI-2026-0148', $row->test_index_no);

        // The trade and the index travel with the file wherever it is read.
        $this->getJson('/api/v1/candidates/'.$row->id)
            ->assertOk()
            ->assertJsonPath('data.jobRole', 'Tiler')
            ->assertJsonPath('data.testIndexNo', 'TI-2026-0148');
    }

    public function test_a_candidate_can_be_registered_for_several_trades(): void
    {
        $tiler = $this->roleId('Tiler');
        $carpenter = $this->roleId('Shuttering Carpenter');

        $id = $this->register(['jobRoleIds' => [$tiler, $carpenter]])
            ->assertCreated()
            ->assertJsonPath('data.candidate.jobRoleId', $tiler)
            ->assertJsonPath('data.candidate.jobRoles.0.name', 'Tiler')
            ->assertJsonPath('data.candidate.jobRoles.1.name', 'Shuttering Carpenter')
            ->json('data.candidate.id');

        // Editing sets the list: Mason added, Tiler taken off.
        $mason = $this->roleId('Mason');
        $this->putJson('/api/v1/candidates/'.$id, ['jobRoleIds' => [$carpenter, $mason]])
            ->assertOk()
            ->assertJsonPath('data.jobRoleId', $carpenter)
            ->assertJsonCount(2, 'data.jobRoles');

        $this->register(['jobRoleIds' => [$tiler, $tiler]], 'N5550001')->assertStatus(422);
    }

    public function test_the_job_category_must_be_one_that_is_on_offer(): void
    {
        $this->register(['jobRoleId' => 9999])
            ->assertStatus(422)
            ->assertJsonPath('errors.jobRoleId', 'Choose a job category from the list.');

        // A trade that has been switched off is not on offer either.
        $retired = JobRole::where('name', 'Painter')->firstOrFail();
        $retired->update(['active' => false]);

        $this->register(['jobRoleId' => $retired->id])->assertStatus(422);

        $this->register(['testIndexNo' => 'TI 2026 0148'])
            ->assertStatus(422)
            ->assertJsonPath('errors.testIndexNo', 'The test index number may contain letters, numbers, / and - only.');

        $this->assertSame(0, Candidate::count());
    }

    public function test_the_test_index_number_finds_the_candidate(): void
    {
        $this->register(['jobRoleId' => $this->roleId('Mason'), 'testIndexNo' => 'TI-2026-0148'])->assertCreated();
        $this->register([], 'N1122334')->assertCreated();

        $this->getJson('/api/v1/candidates?search=TI-2026-0148')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.testIndexNo', 'TI-2026-0148');
    }

    public function test_registering_without_a_job_category_still_works(): void
    {
        // The screen asks for one; the API stays open so nothing already
        // integrated breaks.
        $this->register()
            ->assertCreated()
            ->assertJsonPath('data.candidate.jobRole', null)
            ->assertJsonPath('data.candidate.testIndexNo', null);
    }
}
