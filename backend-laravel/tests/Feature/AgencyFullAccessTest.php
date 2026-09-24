<?php

namespace Tests\Feature;

use App\Models\Agency;
use App\Models\User;
use App\Support\DocumentType;
use App\Support\Jwt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;
use ZipArchive;

/**
 * An agency login owns its candidate files end to end.
 *
 * Scoping and the admin's read-only review are covered elsewhere; this walks
 * the agency's own journey and asserts nothing along it is closed off:
 * register, list, read, attach, download, archive and remove.
 */
class AgencyFullAccessTest extends TestCase
{
    use RefreshDatabase;

    /**
     * The pass is the admin side's switch, so fixtures flip it as the admin
     * and hand the request back to whoever was signed in before.
     */
    private function adminPass(int $id): void
    {
        $headers = $this->defaultHeaders;

        $this->app['auth']->forgetGuards();
        $this->withToken(Jwt::sign(User::where('role_slug', 'main_admin')->firstOrFail()->toPublic()))
            ->patchJson('/api/v1/candidates/'.$id.'/pass', ['passed' => true])
            ->assertOk();

        // Documents also wait for the police report to be applied for.
        \App\Models\Candidate::whereKey($id)->update(['police_status' => 'applied', 'police_reference_no' => 'PR/2026/0001']);

        $this->defaultHeaders = $headers;
        $this->app['auth']->forgetGuards();
    }

    private string $token;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        Storage::fake('local');

        $agency = Agency::create([
            'id' => 'AG-9001',
            'name' => 'Skyline Manpower',
            'code' => 'SKY-9001',
            'address' => '221B Baker Street, Colombo 03',
            'username' => 'tst.skyline',
            'password_hash' => password_hash('Passw0rd1', PASSWORD_BCRYPT),
            'contact' => 'Nadia Perera',
            'email' => 'skyline@example.lk',
            'status' => 'active',
        ]);

        $owner = User::create([
            'name' => 'Nadia Perera',
            'username' => 'skyline.owner',
            'email' => 'owner@skyline.lk',
            'phone' => '0712000001',
            'password_hash' => password_hash('Passw0rd1', PASSWORD_BCRYPT),
            'role_slug' => 'agency_owner',
            'agency_id' => $agency->id,
            'status' => 'active',
        ]);

        $this->app['auth']->forgetGuards();
        $this->token = Jwt::sign($owner->toPublic());
    }

    private function agency()
    {
        return $this->withToken($this->token);
    }

    public function test_an_agency_walks_the_whole_candidate_journey(): void
    {
        // --- register ---
        $id = $this->agency()->postJson('/api/v1/candidates', [
            'name' => 'Kamal Perera',
            'passportNo' => 'N7788990',
            'nicNo' => '901234567V',
            'address' => '12 Temple Road, Negombo',
            'mobile' => '0771234567',
            'email' => 'kamal@example.com',
        ])->assertCreated()->json('data.candidate.id');

        // --- list, with no agencyId needed ---
        $this->agency()->getJson('/api/v1/candidates')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Kamal Perera');

        // --- read one file ---
        $this->agency()->getJson('/api/v1/candidates/'.$id)
            ->assertOk()
            ->assertJsonPath('data.passportNo', 'N7788990');

        // --- edit ---
        $this->agency()->putJson('/api/v1/candidates/'.$id, ['mobile' => '0779999999'])
            ->assertOk()
            ->assertJsonPath('data.mobile', '0779999999');

        // --- passed, which opens the file for documents. The admin side
        // records it: the agency registers candidates, it does not test them.
        $this->adminPass($id);
        $this->agency()->getJson('/api/v1/candidates/'.$id)
            ->assertOk()
            ->assertJsonPath('data.poolStatus', 'passed')
            ->assertJsonPath('data.documentsOpen', true);

        // --- attach every required document ---
        foreach (DocumentType::cases() as $type) {
            $this->agency()->postJson('/api/v1/candidates/'.$id.'/documents', [
                'type' => $type->value,
                'file' => UploadedFile::fake()->create($type->value.'.pdf', 40, 'application/pdf'),
            ])->assertCreated();
        }

        $listing = $this->agency()->getJson('/api/v1/candidates/'.$id.'/documents')
            ->assertOk()->json('data');

        $this->assertCount(count(DocumentType::cases()), $listing['documents']);
        $this->assertSame([], $listing['missing']);

        // --- a second version of one type, since uploads are append-only ---
        $this->agency()->postJson('/api/v1/candidates/'.$id.'/documents', [
            'type' => 'medical',
            'file' => UploadedFile::fake()->create('medical-v2.pdf', 40, 'application/pdf'),
        ])->assertCreated()->assertJsonPath('data.versionCount', 2);

        $this->agency()->getJson('/api/v1/candidates/'.$id.'/documents/history/medical')
            ->assertOk()
            ->assertJsonCount(2, 'data');

        // --- download one file ---
        $documentId = $listing['documents'][0]['id'];
        $this->agency()->get('/api/v1/candidates/'.$id.'/documents/'.$documentId.'/download')
            ->assertOk();

        // --- download the whole set as one archive ---
        $zip = $this->agency()->get('/api/v1/candidates/'.$id.'/documents/download-all')->assertOk();

        $tmp = tempnam(sys_get_temp_dir(), 'zip-agency-');
        file_put_contents($tmp, $zip->streamedContent());
        $archive = new ZipArchive;
        $this->assertTrue($archive->open($tmp, ZipArchive::CHECKCONS) === true);
        $this->assertSame(count(DocumentType::cases()), $archive->numFiles);
        $archive->close();
        @unlink($tmp);

        // --- submitting the profile is the coordinator's call, not the agency's ---
        $this->agency()->patchJson('/api/v1/candidates/'.$id.'/status', ['status' => 'submitted'])
            ->assertStatus(403);

        // --- remove ---
        $this->agency()->deleteJson('/api/v1/candidates/'.$id)->assertOk();
        $this->assertSoftDeleted('candidates', ['id' => $id]);
    }

    public function test_an_agency_account_with_no_agency_linked_is_told_so(): void
    {
        $orphan = User::create([
            'name' => 'Unlinked Owner',
            'username' => 'unlinked.owner',
            'email' => 'unlinked@example.lk',
            'phone' => '0712000002',
            'password_hash' => password_hash('Passw0rd1', PASSWORD_BCRYPT),
            'role_slug' => 'agency_owner',
            'agency_id' => null,
            'status' => 'active',
        ]);
        $this->app['auth']->forgetGuards();

        // Never a silent empty list, which would read as "you have no candidates".
        $this->withToken(Jwt::sign($orphan->toPublic()))
            ->getJson('/api/v1/candidates')
            ->assertStatus(403)
            ->assertJsonPath('message', 'Your account is not linked to an agency.');
    }
}
