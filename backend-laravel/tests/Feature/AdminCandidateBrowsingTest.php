<?php

namespace Tests\Feature;

use App\Models\Agency;
use App\Models\Candidate;
use App\Models\User;
use App\Support\Jwt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Candidate files belong to the agency that registered them.
 *
 * The admin reviews them one agency at a time, chosen deliberately, and only
 * reads: attaching paperwork stays with the agency that owns the candidate.
 */
class AdminCandidateBrowsingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        Storage::fake('local');
    }

    private function makeAgency(string $id, string $name, string $username): Agency
    {
        return Agency::create([
            'id' => $id,
            'name' => $name,
            'code' => strtoupper(substr($name, 0, 3)).'-'.substr($id, 3),
            'address' => '221B Baker Street, Colombo 03',
            'username' => $username,
            'password_hash' => password_hash('Passw0rd1', PASSWORD_BCRYPT),
            'contact' => 'Owner',
            'email' => $username.'@example.lk',
            'status' => 'active',
        ]);
    }

    private function ownerToken(Agency $agency, string $username): string
    {
        $user = User::create([
            'name' => $agency->name.' Owner',
            'username' => $username,
            'email' => $username.'@owner.lk',
            'phone' => '07'.random_int(10000000, 99999999),
            'password_hash' => password_hash('Passw0rd1', PASSWORD_BCRYPT),
            'role_slug' => 'agency_owner',
            'agency_id' => $agency->id,
            'status' => 'active',
        ]);

        $this->app['auth']->forgetGuards();

        return Jwt::sign($user->toPublic());
    }

    private function adminToken(): string
    {
        $this->app['auth']->forgetGuards();

        return Jwt::sign(User::where('role_slug', 'main_admin')->firstOrFail()->toPublic());
    }

    private function makeCandidate(Agency $agency, string $name): Candidate
    {
        return Candidate::create([
            'agency_id' => $agency->id,
            'name' => $name,
            'passport_no' => 'N'.random_int(1000000, 9999999),
            'address' => '12 Temple Road, Negombo',
            'mobile' => '0771234567',
            'status' => 'draft',
        ]);
    }

    public function test_the_admin_sees_nothing_until_an_agency_is_chosen(): void
    {
        $alpha = $this->makeAgency('AG-9001', 'Alpha Agency', 'tst.alpha');
        $beta = $this->makeAgency('AG-9002', 'Beta Agency', 'tst.beta');
        $this->makeCandidate($alpha, 'Kamal Perera');
        $this->makeCandidate($beta, 'Nimal Silva');

        // No agency picked: an empty listing, not every agency in one pile.
        $this->withToken($this->adminToken())
            ->getJson('/api/v1/candidates')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_the_admin_sees_one_agency_at_a_time_once_it_is_chosen(): void
    {
        $alpha = $this->makeAgency('AG-9001', 'Alpha Agency', 'tst.alpha');
        $beta = $this->makeAgency('AG-9002', 'Beta Agency', 'tst.beta');
        $this->makeCandidate($alpha, 'Kamal Perera');
        $this->makeCandidate($beta, 'Nimal Silva');

        $rows = $this->withToken($this->adminToken())
            ->getJson('/api/v1/candidates?agencyId=AG-9001')
            ->assertOk()->json('data');

        $this->assertSame(['Kamal Perera'], array_column($rows, 'name'));
    }

    public function test_an_agency_still_sees_its_own_and_cannot_ask_for_another(): void
    {
        $alpha = $this->makeAgency('AG-9001', 'Alpha Agency', 'tst.alpha');
        $beta = $this->makeAgency('AG-9002', 'Beta Agency', 'tst.beta');
        $this->makeCandidate($alpha, 'Kamal Perera');
        $this->makeCandidate($beta, 'Nimal Silva');

        $token = $this->ownerToken($alpha, 'alpha.owner');

        // No parameter needed - an agency login is scoped to itself.
        $rows = $this->withToken($token)->getJson('/api/v1/candidates')->assertOk()->json('data');
        $this->assertSame(['Kamal Perera'], array_column($rows, 'name'));

        // Naming somebody else's agency changes nothing; the scope wins.
        $rows = $this->withToken($token)
            ->getJson('/api/v1/candidates?agencyId=AG-9002')
            ->assertOk()->json('data');
        $this->assertSame(['Kamal Perera'], array_column($rows, 'name'));
    }

    public function test_the_admin_reads_a_candidate_file_but_cannot_attach_to_it(): void
    {
        $alpha = $this->makeAgency('AG-9001', 'Alpha Agency', 'tst.alpha');
        $candidate = $this->makeCandidate($alpha, 'Kamal Perera');
        $admin = $this->adminToken();

        // Reading the file and its document checklist is the whole job.
        $this->withToken($admin)
            ->getJson('/api/v1/candidates/'.$candidate->id)
            ->assertOk()
            ->assertJsonPath('data.name', 'Kamal Perera');

        $this->withToken($admin)
            ->getJson('/api/v1/candidates/'.$candidate->id.'/documents')
            ->assertOk()
            ->assertJsonCount(8, 'data.required');

        // Attaching is the owning agency's job.
        $this->withToken($admin)
            ->postJson('/api/v1/candidates/'.$candidate->id.'/documents', [
                'type' => 'medical',
                'file' => UploadedFile::fake()->create('medical.pdf', 40, 'application/pdf'),
            ])
            ->assertStatus(403)
            ->assertJsonPath('message', 'Documents are attached by the agency that owns the candidate.');

        $this->withToken($admin)
            ->postJson('/api/v1/candidates/'.$candidate->id.'/documents/bulk', [
                'documents' => ['medical' => UploadedFile::fake()->create('medical.pdf', 40, 'application/pdf')],
            ])
            ->assertStatus(403);

        $this->assertDatabaseCount('candidate_documents', 0);
    }

    public function test_an_agency_can_delete_its_own_candidate(): void
    {
        $alpha = $this->makeAgency('AG-9001', 'Alpha Agency', 'tst.alpha');
        $candidate = $this->makeCandidate($alpha, 'Kamal Perera');
        $token = $this->ownerToken($alpha, 'alpha.owner');

        $this->withToken($token)
            ->deleteJson('/api/v1/candidates/'.$candidate->id)
            ->assertOk();

        // Soft deleted, so the record is recoverable and its files are kept.
        $this->assertSoftDeleted('candidates', ['id' => $candidate->id]);

        $this->withToken($token)->getJson('/api/v1/candidates')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_an_agency_cannot_delete_another_agency_candidate(): void
    {
        $alpha = $this->makeAgency('AG-9001', 'Alpha Agency', 'tst.alpha');
        $beta = $this->makeAgency('AG-9002', 'Beta Agency', 'tst.beta');
        $theirs = $this->makeCandidate($beta, 'Nimal Silva');

        $this->withToken($this->ownerToken($alpha, 'alpha.owner'))
            ->deleteJson('/api/v1/candidates/'.$theirs->id)
            ->assertStatus(403);

        $this->assertDatabaseHas('candidates', ['id' => $theirs->id, 'deleted_at' => null]);
    }

    public function test_an_agent_cannot_delete_candidates(): void
    {
        $alpha = $this->makeAgency('AG-9001', 'Alpha Agency', 'tst.alpha');
        $candidate = $this->makeCandidate($alpha, 'Kamal Perera');

        $agent = User::create([
            'name' => 'Alpha Agent',
            'username' => 'alpha.agent',
            'email' => 'agent@alpha.lk',
            'phone' => '0712000009',
            'password_hash' => password_hash('Passw0rd1', PASSWORD_BCRYPT),
            'role_slug' => 'agent',
            'agency_id' => $alpha->id,
            'status' => 'active',
        ]);
        $this->app['auth']->forgetGuards();

        // Agents register and update; removing a record is not their call.
        $this->withToken(Jwt::sign($agent->toPublic()))
            ->deleteJson('/api/v1/candidates/'.$candidate->id)
            ->assertStatus(403);

        $this->assertDatabaseHas('candidates', ['id' => $candidate->id, 'deleted_at' => null]);
    }
}
