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

        // --- attach every required document ---
        foreach (DocumentType::cases() as $type) {
            $this->agency()->postJson('/api/v1/candidates/'.$id.'/documents', [
                'type' => $type->value,
                'file' => UploadedFile::fake()->create($type->value.'.pdf', 40, 'application/pdf'),
            ])->assertCreated();
        }

        $listing = $this->agency()->getJson('/api/v1/candidates/'.$id.'/documents')
            ->assertOk()->json('data');

        $this->assertCount(8, $listing['documents']);
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
        $this->assertSame(8, $archive->numFiles);
        $archive->close();
        @unlink($tmp);

        // --- submit for review, now that the set is complete ---
        $this->agency()->patchJson('/api/v1/candidates/'.$id.'/status', ['status' => 'submitted'])
            ->assertOk()
            ->assertJsonPath('data.status', 'submitted');

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
