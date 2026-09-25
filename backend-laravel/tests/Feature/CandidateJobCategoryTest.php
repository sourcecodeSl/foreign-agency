<?php

namespace Tests\Feature;

use App\Models\Agency;
use App\Models\Candidate;
use App\Models\JobRole;
use App\Models\User;
use App\Support\Jwt;
use App\Support\Nic;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
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

    public function test_personal_details_are_kept_and_the_birthday_is_read_from_the_nic(): void
    {
        $expiry = now()->addYears(3)->toDateString();

        $candidate = $this->postJson('/api/v1/candidates', [
            'firstName' => 'Kamal',
            'lastName' => 'Perera',
            'fatherName' => 'Sunil Perera',
            'passportNo' => 'N7788990',
            'passportExpiry' => $expiry,
            // Old format, a woman: day 522 is day 22, 22 January 1990.
            'nicNo' => '905223456V',
            'profession' => 'Tile layer',
            'testResults' => 'NVQ Level 3 - Pass',
            'address' => '12 Temple Road, Negombo',
            'mobile' => '0771234567',
        ])->assertCreated()->json('data.candidate');

        $this->assertSame('Kamal Perera', $candidate['name']);
        $this->assertSame('Kamal', $candidate['firstName']);
        $this->assertSame('Perera', $candidate['lastName']);
        $this->assertSame('Sunil Perera', $candidate['fatherName']);
        $this->assertSame('1990-01-22', $candidate['dateOfBirth']);
        $this->assertSame($expiry, $candidate['passportExpiry']);
        $this->assertSame('Tile layer', $candidate['profession']);
        $this->assertSame('NVQ Level 3 - Pass', $candidate['testResults']);

        // A new NIC moves the birthday with it; a new last name, the full name.
        $this->putJson('/api/v1/candidates/'.$candidate['id'], ['nicNo' => '199206001234', 'lastName' => 'Silva'])
            ->assertOk()
            ->assertJsonPath('data.dateOfBirth', '1992-02-29')
            ->assertJsonPath('data.name', 'Kamal Silva');
    }

    public function test_a_passport_with_little_left_on_it_is_saved_with_a_warning(): void
    {
        // Short, but still usable: saved, and said out loud every time.
        $soon = now()->addYear()->toDateString();
        $this->register(['passportExpiry' => $soon])
            ->assertCreated()
            ->assertJsonPath('data.candidate.passportExpiry', $soon)
            ->assertJsonPath('data.candidate.passportWarning',
                'The passport is valid until '.now()->addYear()->format('j M Y').', which is less than 3 years away.');

        // Already expired is a warning too, never a refusal.
        $this->register(['passportExpiry' => now()->subDay()->toDateString()], 'N5550002')
            ->assertCreated()
            ->assertJsonPath('data.candidate.passportWarning',
                'The passport expired on '.now()->subDay()->format('j M Y').'.');

        // Four years out, nothing to say.
        $this->register(['passportExpiry' => now()->addYears(4)->toDateString()], 'N5550003')
            ->assertCreated()
            ->assertJsonPath('data.candidate.passportWarning', null);
    }

    public function test_the_police_report_is_applied_for_then_received(): void
    {
        $id = $this->register()->assertCreated()->json('data.candidate.id');
        $url = '/api/v1/candidates/'.$id.'/police-report';

        $this->assertSame('not_applied', $this->getJson('/api/v1/candidates/'.$id)->json('data.policeReport.status'));

        // Applied needs the reference number.
        $this->patchJson($url, ['status' => 'applied'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['referenceNo']);

        $this->patchJson($url, ['status' => 'applied', 'referenceNo' => 'PR/2026/8891'])
            ->assertOk()
            ->assertJsonPath('data.policeReport.status', 'applied')
            ->assertJsonPath('data.policeReport.referenceNo', 'PR/2026/8891')
            ->assertJsonPath('data.policeReport.expiresOn', null);

        // Received needs the date it was issued as well.
        $this->patchJson($url, ['status' => 'received', 'referenceNo' => 'PR/2026/8891'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['issuedDate']);

        $issued = now()->subMonth();
        $this->patchJson($url, [
            'status' => 'received',
            'referenceNo' => 'PR/2026/8891',
            'issuedDate' => $issued->toDateString(),
        ])
            ->assertOk()
            // Six months from the day it was issued.
            ->assertJsonPath('data.policeReport.expiresOn', $issued->copy()->addMonths(6)->toDateString())
            ->assertJsonPath('data.policeReport.warning', null);
    }

    public function test_a_police_report_close_to_expiry_is_saved_with_a_warning(): void
    {
        $id = $this->register()->assertCreated()->json('data.candidate.id');
        $url = '/api/v1/candidates/'.$id.'/police-report';

        // Issued five months ago: one month left, under the two-month mark.
        $issued = now()->subMonths(5);
        $expires = $issued->copy()->addMonths(6);

        $this->patchJson($url, [
            'status' => 'received',
            'referenceNo' => 'PR/2026/1200',
            'issuedDate' => $issued->toDateString(),
        ])
            ->assertOk()
            ->assertJsonPath('data.policeReport.warning',
                'The police report expires on '.$expires->format('j M Y').', which is less than 2 months away.');

        // Issued seven months ago: gone, still saved.
        $this->patchJson($url, [
            'status' => 'received',
            'referenceNo' => 'PR/2026/1200',
            'issuedDate' => now()->subMonths(7)->toDateString(),
        ])
            ->assertOk()
            ->assertJsonPath('data.policeReport.warning',
                'The police report expired on '.now()->subMonths(7)->addMonths(6)->format('j M Y').'.');

        // A report cannot have been issued in the future.
        $this->patchJson($url, [
            'status' => 'received',
            'referenceNo' => 'PR/2026/1200',
            'issuedDate' => now()->addDay()->toDateString(),
        ])->assertStatus(422)->assertJsonValidationErrors(['issuedDate']);
    }

    public function test_the_nic_gives_the_date_of_birth(): void
    {
        $this->assertSame('1990-01-22', Nic::birthDate('900223456V'));
        $this->assertSame('1990-01-22', Nic::birthDate('199052203456'));
        $this->assertSame('1990-03-01', Nic::birthDate('900613456V'));
        $this->assertNull(Nic::birthDate('900603456V'));   // 29 Feb 1990 never happened
        $this->assertNull(Nic::birthDate('909993456V'));
        $this->assertNull(Nic::birthDate(null));
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

    public function test_the_police_report_can_be_given_when_registering(): void
    {
        $id = $this->register([
            'policeStatus' => 'received',
            'policeReferenceNo' => 'PR/2026/8891',
            'policeIssuedDate' => now()->subMonth()->toDateString(),
        ])->assertCreated()
            ->assertJsonPath('data.candidate.policeReport.status', 'received')
            ->assertJsonPath('data.candidate.policeReport.referenceNo', 'PR/2026/8891')
            ->json('data.candidate.id');

        // The same details the file shows and keeps up to date.
        $this->getJson('/api/v1/candidates/'.$id)
            ->assertJsonPath('data.policeReport.status', 'received')
            ->assertJsonPath('data.policeReport.issuedDate', now()->subMonth()->toDateString());

        // Applied needs its reference number, as on the file.
        $this->register(['policeStatus' => 'applied'], 'N1122334')
            ->assertStatus(422)
            ->assertJsonPath('errors.policeReferenceNo', 'Enter the police report reference number.');

        // Left out, the file starts as not applied.
        $this->register([], 'N5566778')->assertCreated()
            ->assertJsonPath('data.candidate.policeReport.status', 'not_applied');
    }

    public function test_the_police_report_file_goes_on_before_the_pass(): void
    {
        Storage::fake('local');
        $pdf = fn () => UploadedFile::fake()->create('police.pdf', 40, 'application/pdf');

        // Not applied for: nothing to attach yet.
        $plain = $this->register([], 'N1122334')->assertCreated()->json('data.candidate');
        $this->assertFalse($plain['policeDocumentOpen']);
        $this->postJson('/api/v1/candidates/'.$plain['id'].'/documents', ['type' => 'online_police_report', 'file' => $pdf()])
            ->assertStatus(409);

        // Applied for on the registration form: the police report file goes on straight away.
        $id = $this->register(['policeStatus' => 'applied', 'policeReferenceNo' => 'PR/2026/8891'])
            ->assertCreated()
            ->assertJsonPath('data.candidate.policeDocumentOpen', true)
            ->assertJsonPath('data.candidate.documentsOpen', false)
            ->json('data.candidate.id');

        $this->postJson('/api/v1/candidates/'.$id.'/documents', ['type' => 'online_police_report', 'file' => $pdf()])
            ->assertCreated()
            ->assertJsonPath('data.document.type', 'online_police_report');

        // Every other document still waits for the pass.
        $this->postJson('/api/v1/candidates/'.$id.'/documents', ['type' => 'medical', 'file' => $pdf()])
            ->assertStatus(409);
    }
}
