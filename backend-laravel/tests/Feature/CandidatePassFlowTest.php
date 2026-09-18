<?php

namespace Tests\Feature;

use App\Models\Agency;
use App\Models\Candidate;
use App\Models\ForeignCompany;
use App\Models\User;
use App\Support\DocumentType;
use App\Support\Jwt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Passing is the agency's own switch, and it decides what happens next:
 *
 *  - until a candidate passes, the same person may be registered with any
 *    agency, and no documents are attached;
 *  - once passed, documents open - attached by the agency alone - and no
 *    other agency can register or pass that person;
 *  - a coordinator checks the documents and submits the whole profile.
 *
 * Every file also says where it came from: the agency, or a coordinator.
 */
class CandidatePassFlowTest extends TestCase
{
    use RefreshDatabase;

    private string $admin;

    private string $alpha;

    private string $beta;

    private string $coordinator;

    private int $accounts = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        Storage::fake('local');

        $this->admin = Jwt::sign(User::where('role_slug', 'main_admin')->first()->toPublic());
        $this->alpha = $this->agency('AG-9001', 'Alpha Agency', 'alpha.owner');
        $this->beta = $this->agency('AG-9002', 'Beta Agency', 'beta.owner');

        $coordinatorId = $this->as($this->admin)->postJson('/api/v1/coordinators', [
            'name' => 'Kasun Coordinator',
            'username' => 'kasun.coord',
            'email' => 'kasun.coord@example.lk',
            'phone' => '0715550001',
            'pages' => ['candidates'],
        ])->assertCreated()->json('data.id');
        $this->coordinator = Jwt::sign(User::findOrFail($coordinatorId)->toPublic());
    }

    /** An active agency and its owner's token. */
    private function agency(string $id, string $name, string $username): string
    {
        Agency::create([
            'id' => $id,
            'name' => $name,
            'code' => 'TST-'.substr($id, 3),
            'address' => '1 Main Street, Colombo',
            'username' => $username,
            'contact' => $name.' Owner',
            'email' => $username.'@example.lk',
            'status' => 'active',
        ]);

        $owner = User::create([
            'name' => $name.' Owner',
            'username' => $username,
            'email' => $username.'@example.lk',
            'phone' => '071200000'.++$this->accounts,
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

    private function register(string $token, array $overrides = [])
    {
        return $this->as($token)->postJson('/api/v1/candidates', $overrides + [
            'name' => 'Kamal Perera',
            'passportNo' => 'N7788990',
            'nicNo' => '901234567V',
            'address' => '12 Temple Road, Negombo',
            'mobile' => '0771234567',
        ]);
    }

    private function pass(string $token, int $id, bool $passed = true)
    {
        return $this->as($token)->patchJson('/api/v1/candidates/'.$id.'/pass', ['passed' => $passed]);
    }

    private function upload(string $token, int $id, string $type = 'medical')
    {
        return $this->as($token)->postJson('/api/v1/candidates/'.$id.'/documents', [
            'type' => $type,
            'file' => UploadedFile::fake()->create($type.'.pdf', 40, 'application/pdf'),
        ]);
    }

    public function test_documents_open_only_once_the_agency_switches_the_pass_on(): void
    {
        $id = $this->register($this->alpha)->assertCreated()
            ->assertJsonPath('data.candidate.poolStatus', 'pool')
            ->assertJsonPath('data.candidate.documentsOpen', false)
            ->json('data.candidate.id');

        $this->upload($this->alpha, $id)
            ->assertStatus(409)
            ->assertJsonPath('message', 'Documents are attached only after the candidate has passed. Mark Kamal Perera as passed first.');

        $this->pass($this->alpha, $id)->assertOk()
            ->assertJsonPath('data.poolStatus', 'passed')
            ->assertJsonPath('data.documentsOpen', true);
        $this->assertNotNull(Candidate::find($id)->passed_at);

        $this->upload($this->alpha, $id)->assertCreated();

        // Switched off again, the file closes to documents once more.
        $this->pass($this->alpha, $id, false)->assertOk()
            ->assertJsonPath('data.poolStatus', 'pool')
            ->assertJsonPath('data.documentsOpen', false);
        $this->upload($this->alpha, $id)->assertStatus(409);
    }

    public function test_the_pass_is_the_agencys_switch_alone(): void
    {
        $id = $this->register($this->alpha)->assertCreated()->json('data.candidate.id');

        $this->pass($this->admin, $id)->assertStatus(403);
        $this->pass($this->coordinator, $id)->assertStatus(403);
        // Another agency cannot even see the file.
        $this->pass($this->beta, $id)->assertStatus(403);

        $this->assertSame('pool', Candidate::find($id)->pool_status);
    }

    public function test_someone_not_yet_passed_may_register_with_another_agency(): void
    {
        $this->register($this->alpha)->assertCreated();
        $this->register($this->beta)->assertCreated();

        $this->assertSame(2, Candidate::where('passport_no', 'N7788990')->count());
    }

    public function test_a_passed_candidate_cannot_register_with_another_agency(): void
    {
        $id = $this->register($this->alpha)->assertCreated()->json('data.candidate.id');
        $this->pass($this->alpha, $id)->assertOk();

        $message = 'The candidate with NIC 901234567V has already passed with another agency, '
            .'so they cannot be registered with another agency.';

        // Known by NIC, whatever passport is given.
        $this->register($this->beta, ['passportNo' => 'N0000001'])
            ->assertStatus(409)
            ->assertJsonPath('message', $message)
            ->assertJsonPath('errors.nicNo', $message);

        // The new 12-digit form of the same NIC is the same person.
        $this->register($this->beta, ['passportNo' => 'N0000002', 'nicNo' => '199012304567'])
            ->assertStatus(409);

        // A coordinator filing for Beta is refused too, and told who holds them.
        $this->register($this->coordinator, ['agencyId' => 'AG-9002'])
            ->assertStatus(409)
            ->assertJsonPath('message', 'The candidate with NIC 901234567V has already passed with Alpha Agency, '
                .'so they cannot be registered with another agency.');

        $this->assertSame(1, Candidate::where('nic_key', '199012304567')->count());
    }

    public function test_the_same_nic_in_either_format_is_one_person_within_an_agency(): void
    {
        $this->register($this->alpha)->assertCreated();

        $this->register($this->alpha, ['passportNo' => 'N0000003', 'nicNo' => '199012304567'])
            ->assertStatus(422)
            ->assertJsonPath('errors.nicNo', 'A candidate with this NIC already exists.');
    }

    public function test_files_already_at_other_agencies_are_blocked_once_one_passes(): void
    {
        $alphaId = $this->register($this->alpha)->assertCreated()->json('data.candidate.id');
        $betaId = $this->register($this->beta)->assertCreated()->json('data.candidate.id');

        // Beta registered first, so Beta's file was there before the pass.
        $this->as($this->beta)->getJson('/api/v1/candidates/'.$betaId)->assertJsonPath('data.blocked', false);

        $this->pass($this->alpha, $alphaId)
            ->assertOk()
            ->assertJsonPath('message', 'Kamal Perera is marked as passed. You can now attach the documents. '
                .'Their file at 1 other agency is now blocked.');

        // Beta sees its file blocked, without being told which agency holds the pass...
        $this->as($this->beta)->getJson('/api/v1/candidates/'.$betaId)
            ->assertOk()
            ->assertJsonPath('data.blocked', true)
            ->assertJsonPath('data.blockedBy', null);
        $this->as($this->beta)->getJson('/api/v1/candidates')
            ->assertJsonPath('data.0.blocked', true);

        // ...while a coordinator is.
        $this->as($this->coordinator)->getJson('/api/v1/candidates/'.$betaId)
            ->assertJsonPath('data.blockedBy', 'Alpha Agency');

        // Nothing more happens to a blocked file: no pass, no documents, no edits.
        $blocked = 'Kamal Perera has already passed with another agency, so this file is blocked.';
        $this->pass($this->beta, $betaId)
            ->assertStatus(409)
            ->assertJsonPath('message', 'Kamal Perera has already passed with another agency, so they cannot be passed here.');
        $this->upload($this->beta, $betaId)->assertStatus(409)->assertJsonPath('message', $blocked);
        $this->as($this->beta)->putJson('/api/v1/candidates/'.$betaId, ['mobile' => '0779999999'])
            ->assertStatus(409)->assertJsonPath('message', $blocked);

        // Once Alpha lets the person go, Beta's file opens again.
        $this->pass($this->alpha, $alphaId, false)->assertOk();
        $this->as($this->beta)->getJson('/api/v1/candidates/'.$betaId)->assertJsonPath('data.blocked', false);
        $this->pass($this->beta, $betaId)->assertOk();
    }

    public function test_a_file_cannot_be_edited_into_someone_passed_elsewhere(): void
    {
        $id = $this->register($this->alpha)->assertCreated()->json('data.candidate.id');
        $this->pass($this->alpha, $id)->assertOk();

        $other = $this->register($this->beta, ['passportNo' => 'N5555555', 'nicNo' => '905555555V'])
            ->assertCreated()->json('data.candidate.id');

        $this->as($this->beta)->putJson('/api/v1/candidates/'.$other, ['nicNo' => '901234567V'])
            ->assertStatus(409);

        // Unrelated edits still save.
        $this->as($this->beta)->putJson('/api/v1/candidates/'.$other, ['mobile' => '0779999999'])
            ->assertOk();
    }

    public function test_only_one_agency_can_hold_the_pass(): void
    {
        $alphaId = $this->register($this->alpha)->assertCreated()->json('data.candidate.id');
        $betaId = $this->register($this->beta)->assertCreated()->json('data.candidate.id');

        $this->pass($this->alpha, $alphaId)->assertOk();
        $this->pass($this->beta, $betaId)->assertStatus(409);

        // Once Alpha takes them off its register, they are free again.
        $this->as($this->alpha)->deleteJson('/api/v1/candidates/'.$alphaId)->assertOk();
        $this->pass($this->beta, $betaId)->assertOk();
    }

    public function test_a_file_without_an_nic_cannot_be_passed(): void
    {
        // An older file, from before the NIC was required.
        $id = Candidate::create([
            'agency_id' => 'AG-9001',
            'name' => 'Old File',
            'passport_no' => 'N4444444',
            'address' => '12 Temple Road, Negombo',
            'mobile' => '0771234567',
            'status' => 'draft',
        ])->id;

        $this->pass($this->alpha, $id)
            ->assertStatus(422)
            ->assertJsonPath('message', "Add the NIC number to Old File's file before marking them as passed.");
    }

    public function test_the_coordinator_checks_the_documents_and_submits_the_profile(): void
    {
        $id = $this->register($this->alpha)->assertCreated()->json('data.candidate.id');

        // Not passed: nothing to submit.
        $this->as($this->coordinator)->patchJson('/api/v1/candidates/'.$id.'/status', ['status' => 'submitted'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Only a candidate who has passed can be submitted.');

        $this->pass($this->alpha, $id)->assertOk();
        foreach (DocumentType::cases() as $type) {
            $this->upload($this->alpha, $id, $type->value)->assertCreated();
        }

        // The agency attaches, but never submits.
        $this->as($this->alpha)->patchJson('/api/v1/candidates/'.$id.'/status', ['status' => 'submitted'])
            ->assertStatus(403)
            ->assertJsonPath('message', "Only a coordinator can check the documents and submit a candidate's profile.");

        $this->as($this->coordinator)->patchJson('/api/v1/candidates/'.$id.'/status', ['status' => 'submitted'])
            ->assertOk()
            ->assertJsonPath('data.status', 'submitted')
            ->assertJsonPath('data.submittedBy', 'Kasun Coordinator')
            ->assertJsonPath('data.documentsOpen', false);

        // The submitted profile is settled: no more documents, and the pass stays.
        $this->upload($this->alpha, $id)->assertStatus(409);
        $this->pass($this->alpha, $id, false)->assertStatus(409);
    }

    public function test_switching_the_submit_off_sends_the_profile_back_to_the_agency(): void
    {
        $id = $this->register($this->alpha)->assertCreated()->json('data.candidate.id');
        $this->pass($this->alpha, $id)->assertOk();
        foreach (DocumentType::cases() as $type) {
            $this->upload($this->alpha, $id, $type->value)->assertCreated();
        }

        $this->as($this->coordinator)->patchJson('/api/v1/candidates/'.$id.'/status', ['status' => 'submitted'])
            ->assertOk();

        $this->as($this->coordinator)->patchJson('/api/v1/candidates/'.$id.'/status', ['status' => 'draft'])
            ->assertOk()
            ->assertJsonPath('message', "Kamal Perera's profile is back with the agency.")
            ->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.submittedAt', null)
            ->assertJsonPath('data.submittedBy', null)
            ->assertJsonPath('data.documentsOpen', true);

        // The agency can put right what was wrong, and the coordinator submits again.
        $this->upload($this->alpha, $id)->assertCreated();
        $this->as($this->coordinator)->patchJson('/api/v1/candidates/'.$id.'/status', ['status' => 'submitted'])
            ->assertOk()
            ->assertJsonPath('data.submittedBy', 'Kasun Coordinator');
    }

    public function test_a_coordinator_without_the_candidates_page_cannot_submit(): void
    {
        $id = $this->register($this->alpha)->assertCreated()->json('data.candidate.id');

        $otherId = $this->as($this->admin)->postJson('/api/v1/coordinators', [
            'name' => 'Ruwan Coordinator',
            'username' => 'ruwan.coord',
            'email' => 'ruwan.coord@example.lk',
            'phone' => '0715550002',
            'pages' => ['verification'],
        ])->assertCreated()->json('data.id');

        $this->as(Jwt::sign(User::findOrFail($otherId)->toPublic()))
            ->patchJson('/api/v1/candidates/'.$id.'/status', ['status' => 'submitted'])
            ->assertStatus(403);
    }

    public function test_every_file_says_where_it_came_from(): void
    {
        $this->register($this->alpha)->assertCreated()
            ->assertJsonPath('data.candidate.registeredBy.source', 'agency')
            ->assertJsonPath('data.candidate.registeredBy.label', 'Agency')
            ->assertJsonPath('data.candidate.registeredBy.name', 'Alpha Agency Owner');

        $this->register($this->coordinator, ['agencyId' => 'AG-9001', 'passportNo' => 'N1122334', 'nicNo' => '881122334V'])
            ->assertCreated()
            ->assertJsonPath('data.candidate.agencyId', 'AG-9001')
            ->assertJsonPath('data.candidate.registeredBy.source', 'coordinator')
            ->assertJsonPath('data.candidate.registeredBy.name', 'Kasun Coordinator');

        // The agency sees both on its own list, each marked.
        $rows = $this->as($this->alpha)->getJson('/api/v1/candidates')->assertOk()->json('data');
        $this->assertEqualsCanonicalizing(['agency', 'coordinator'], array_column(array_column($rows, 'registeredBy'), 'source'));
    }

    public function test_a_pass_from_a_skill_test_stays_on(): void
    {
        $id = $this->register($this->alpha)->assertCreated()->json('data.candidate.id');

        $company = ForeignCompany::create([
            'code' => ForeignCompany::nextCode(),
            'name' => 'Herzl Construction',
            'country' => 'Israel',
            'status' => 'active',
        ]);
        Candidate::find($id)->update([
            'pool_status' => 'passed',
            'locked_company_id' => $company->id,
            'locked_at' => now(),
            'passed_at' => now(),
        ]);

        // The documents open just as they do for the agency's own pass...
        $this->upload($this->alpha, $id)->assertCreated();

        // ...but the agency cannot undo a result the test recorded.
        $this->pass($this->alpha, $id, false)
            ->assertStatus(409)
            ->assertJsonPath('message', 'Kamal Perera passed a skill test with Herzl Construction, so the pass cannot be switched off here.');
    }
}
