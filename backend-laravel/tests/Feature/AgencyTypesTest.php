<?php

namespace Tests\Feature;

use App\Models\Agency;
use App\Models\Candidate;
use App\Models\User;
use App\Support\Jwt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Agencies are local (Sri Lanka) or foreign (overseas). A coordinator can
 * create either; each gets its own login and registers its own candidates,
 * and neither sees the other's files.
 *
 * A foreign agency is not a foreign company: companies are the overseas
 * employers that run skill tests, and they live in their own directory.
 */
class AgencyTypesTest extends TestCase
{
    use RefreshDatabase;

    private string $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();

        $this->admin = Jwt::sign(User::where('role_slug', 'main_admin')->first()->toPublic());
    }

    private function as(string $token)
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken($token);
    }

    /** A coordinator who may create agencies, approve them and read candidate files. */
    private function coordinator(): string
    {
        $id = $this->as($this->admin)->postJson('/api/v1/coordinators', [
            'name' => 'Kasun Jayawardena',
            'username' => 'kasun.coord',
            'email' => 'kasun@example.lk',
            'phone' => '0715550101',
            'pages' => ['agencies', 'agencies.create', 'candidates'],
        ])->assertCreated()->json('data.id');

        return Jwt::sign(User::findOrFail($id)->toPublic());
    }

    private function agency(array $overrides = []): array
    {
        return $overrides + [
            'name' => 'Horizon Manpower',
            'contact' => 'Avi Cohen',
            'address' => '12 Herzl Street, Tel Aviv',
            'username' => 'horizon.owner',
            'password' => 'Horizon@2026',
            'email' => 'owner@horizon.example',
            'phone' => '+972501234567',
        ];
    }

    private function candidate(string $passport): array
    {
        return [
            'name' => 'Kamal Perera',
            'passportNo' => $passport,
            'nicNo' => substr(preg_replace('/\D/', '', $passport).'000000000', 0, 9).'V',
            'address' => '12 Temple Road, Negombo',
            'mobile' => '0771234567',
        ];
    }

    public function test_a_coordinator_creates_a_foreign_agency_that_registers_its_own_candidates(): void
    {
        $coordinator = $this->coordinator();

        $created = $this->as($coordinator)
            ->postJson('/api/v1/agencies', $this->agency(['type' => 'foreign', 'country' => 'Israel']))
            ->assertCreated()
            ->assertJsonPath('data.type', 'foreign')
            ->assertJsonPath('data.country', 'Israel')
            ->assertJsonPath('data.status', 'pending')
            ->json('data');

        // Approved like any other agency, after which its own login works.
        $this->patchJson('/api/v1/agencies/'.$created['id'].'/status', ['status' => 'active'])->assertOk();

        $this->postJson('/api/v1/auth/login', ['username' => 'horizon.owner', 'password' => 'Horizon@2026'])
            ->assertOk()
            ->assertJsonPath('data.nextStep', 'phone');

        $owner = User::where('username', 'horizon.owner')->firstOrFail();
        $this->assertSame('agency_owner', $owner->role_slug);
        $this->assertSame($created['id'], $owner->agency_id);

        $candidateId = $this->as(Jwt::sign($owner->toPublic()))
            ->postJson('/api/v1/candidates', $this->candidate('N7788990'))
            ->assertCreated()
            ->json('data.candidate.id');

        $this->assertSame($created['id'], Candidate::findOrFail($candidateId)->agency_id);
        $this->getJson('/api/v1/candidates')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.agency.type', 'foreign');
    }

    public function test_local_and_foreign_agencies_work_side_by_side_without_seeing_each_other(): void
    {
        $coordinator = $this->coordinator();

        $foreign = $this->as($coordinator)
            ->postJson('/api/v1/agencies', $this->agency(['type' => 'foreign', 'country' => 'Israel']))
            ->assertCreated()
            ->json('data.id');

        $local = $this->postJson('/api/v1/agencies', $this->agency([
            'name' => 'Kandy Recruiters',
            'contact' => 'Nimal Silva',
            'address' => '5 Hill Street, Kandy',
            'username' => 'kandy.owner',
            'email' => 'owner@kandy.example',
            'phone' => '0771112233',
        ]))->assertCreated()
            ->assertJsonPath('data.type', 'local')
            ->assertJsonPath('data.country', 'Sri Lanka')
            ->json('data.id');

        // The list and its counts can be narrowed to one kind - the Foreign
        // Agency and Local Agency links in the menu do exactly this.
        $foreignIds = collect($this->getJson('/api/v1/agencies?type=foreign')->assertOk()->json('data'))->pluck('id')->all();
        $this->assertSame([$foreign], $foreignIds);
        $this->getJson('/api/v1/agencies/counts?type=foreign')->assertOk()->assertJsonPath('data.all', 1);
        $this->assertContains($local, collect($this->getJson('/api/v1/agencies?type=local')->json('data'))->pluck('id')->all());

        foreach ([$foreign, $local] as $id) {
            $this->patchJson('/api/v1/agencies/'.$id.'/status', ['status' => 'active'])->assertOk();
        }

        $foreignOwner = Jwt::sign(User::where('agency_id', $foreign)->firstOrFail()->toPublic());
        $localOwner = Jwt::sign(User::where('agency_id', $local)->firstOrFail()->toPublic());

        $localCandidate = $this->as($localOwner)
            ->postJson('/api/v1/candidates', $this->candidate('N1122334'))
            ->assertCreated()
            ->json('data.candidate.id');

        // The foreign agency sees neither the local agency's candidates nor the agency itself.
        $this->as($foreignOwner)->getJson('/api/v1/candidates')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/candidates/'.$localCandidate)->assertStatus(403);
        $this->getJson('/api/v1/agencies/'.$local)->assertStatus(403);
    }

    public function test_a_foreign_agency_needs_its_country_and_the_type_is_checked(): void
    {
        $this->as($this->coordinator())
            ->postJson('/api/v1/agencies', $this->agency(['type' => 'foreign']))
            ->assertStatus(422)
            ->assertJsonPath('errors.country', 'Enter the country a foreign agency is based in.');

        $this->postJson('/api/v1/agencies', $this->agency(['type' => 'overseas']))
            ->assertStatus(422)
            ->assertJsonPath('errors.type', 'Choose a local or a foreign agency.');

        $this->assertSame(0, Agency::where('username', 'horizon.owner')->count());
    }
}
