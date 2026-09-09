<?php

namespace Tests\Feature;

use App\Models\Agency;
use App\Models\Candidate;
use App\Models\User;
use App\Support\DocumentType;
use App\Support\Jwt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;
use ZipArchive;

/**
 * Documents are append-only history, and the whole set downloads as one zip
 * named after the candidate, holding the latest file of each type.
 */
class CandidateDocumentHistoryTest extends TestCase
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
            'contact' => 'Owner',
            'email' => 'skyline@example.lk',
            'status' => 'active',
        ]);

        $owner = User::create([
            'name' => 'Skyline Owner',
            'username' => 'skyline.owner',
            'email' => 'owner@skyline.lk',
            'phone' => '0712000001',
            'password_hash' => password_hash('Passw0rd1', PASSWORD_BCRYPT),
            'role_slug' => 'agency_owner',
            'agency_id' => $agency->id,
            'status' => 'active',
        ]);

        $this->token = Jwt::sign($owner->toPublic());
    }

    /** Registers a candidate with only the fields the agency actually fills. */
    private function candidateId(string $name = 'Kamal Perera'): int
    {
        return $this->withToken($this->token)->postJson('/api/v1/candidates', [
            'name' => $name,
            'passportNo' => 'N'.random_int(1000000, 9999999),
            'address' => '12 Temple Road, Negombo',
            'mobile' => '0771234567',
            'email' => 'kamal@example.com',
        ])->assertCreated()->json('data.candidate.id');
    }

    private function upload(int $id, string $type, string $filename)
    {
        return $this->withToken($this->token)->postJson('/api/v1/candidates/'.$id.'/documents', [
            'type' => $type,
            'file' => UploadedFile::fake()->create($filename, 40, 'application/pdf'),
        ]);
    }

    /**
     * Entry names inside a streamed archive.
     *
     * Read back with ZipArchive on purpose: the archive is written by hand in
     * App\Support\ZipStream, so a real reader is what proves it is valid.
     *
     * @return string[]
     */
    private function zipEntries(string $archive): array
    {
        $tmp = tempnam(sys_get_temp_dir(), 'zip-test-');
        file_put_contents($tmp, $archive);

        $zip = new ZipArchive;
        $this->assertTrue($zip->open($tmp, ZipArchive::CHECKCONS) === true);

        $entries = [];
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $entries[] = $zip->getNameIndex($i);
        }
        $zip->close();
        @unlink($tmp);

        return $entries;
    }

    public function test_a_candidate_registers_without_an_nic(): void
    {
        $id = $this->candidateId();

        $this->assertDatabaseHas('candidates', ['id' => $id, 'nic_no' => null]);
    }

    public function test_uploading_the_same_type_three_times_keeps_all_three(): void
    {
        $id = $this->candidateId();

        foreach (['first.pdf', 'second.pdf', 'third.pdf'] as $i => $name) {
            $this->upload($id, 'medical', $name)
                ->assertCreated()
                ->assertJsonPath('data.versionCount', $i + 1);
        }

        // Three rows, three files - nothing was replaced.
        $this->assertDatabaseCount('candidate_documents', 3);
        $this->assertCount(3, Candidate::find($id)->documents);

        foreach (Candidate::find($id)->documents as $document) {
            Storage::disk('local')->assertExists($document->path);
        }
    }

    public function test_the_newest_upload_is_the_current_one(): void
    {
        $id = $this->candidateId();

        $this->upload($id, 'medical', 'old.pdf');
        $this->upload($id, 'medical', 'newest.pdf');

        $data = $this->withToken($this->token)
            ->getJson('/api/v1/candidates/'.$id.'/documents')
            ->assertOk()->json('data');

        $this->assertSame('newest.pdf', $data['latest']['medical']['originalName']);

        // The listing marks exactly one row as current.
        $flags = array_column($data['documents'], 'isLatest');
        $this->assertSame(1, count(array_filter($flags)));
        $this->assertSame('newest.pdf', $data['documents'][0]['originalName']);
    }

    public function test_the_history_of_one_type_is_readable(): void
    {
        $id = $this->candidateId();

        $this->upload($id, 'agreement', 'v1.pdf');
        $this->upload($id, 'agreement', 'v2.pdf');
        $this->upload($id, 'agreement', 'v3.pdf');

        $history = $this->withToken($this->token)
            ->getJson('/api/v1/candidates/'.$id.'/documents/history/agreement')
            ->assertOk()->json('data');

        $this->assertSame(['v3.pdf', 'v2.pdf', 'v1.pdf'], array_column($history, 'originalName'));
    }

    public function test_an_attached_document_cannot_be_deleted(): void
    {
        $id = $this->candidateId();
        $documentId = $this->upload($id, 'medical', 'medical.pdf')->assertCreated()->json('data.document.id');

        // The route does not exist at all.
        $this->deleteJson('/api/v1/candidates/'.$id.'/documents/'.$documentId)
            ->assertStatus(404);

        $this->assertDatabaseCount('candidate_documents', 1);
    }

    public function test_the_zip_holds_the_latest_file_of_every_type_in_its_own_folder(): void
    {
        $id = $this->candidateId('Kamal Perera');

        // Two types, each uploaded twice - the zip must carry the newer file.
        $this->upload($id, 'passport_copy', 'passport-old.pdf');
        $this->upload($id, 'passport_copy', 'passport-new.pdf');
        $this->upload($id, 'medical', 'medical-old.pdf');
        $this->upload($id, 'medical', 'medical-new.pdf');
        $this->upload($id, 'agreement', 'agreement.pdf');

        $response = $this->withToken($this->token)
            ->get('/api/v1/candidates/'.$id.'/documents/download-all')
            ->assertOk();

        // Named after the candidate.
        $this->assertStringContainsString(
            'Kamal-Perera-documents.zip',
            $response->headers->get('content-disposition')
        );

        $tmp = tempnam(sys_get_temp_dir(), 'zip-test-');
        file_put_contents($tmp, $response->streamedContent());

        $zip = new ZipArchive;
        $this->assertTrue($zip->open($tmp) === true);

        $entries = [];
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $entries[] = $zip->getNameIndex($i);
        }
        $zip->close();
        @unlink($tmp);

        // One folder per type, in the canonical order, holding the newest file.
        $this->assertSame([
            '01 Passport Copy/passport-new.pdf',
            '02 Medical/medical-new.pdf',
            '03 Agreement/agreement.pdf',
        ], $entries);
    }

    public function test_the_zip_covers_all_eight_types_when_every_one_is_uploaded(): void
    {
        $id = $this->candidateId('Nimal Silva');

        foreach (DocumentType::cases() as $type) {
            $this->upload($id, $type->value, $type->value.'.pdf');
        }

        $response = $this->withToken($this->token)
            ->get('/api/v1/candidates/'.$id.'/documents/download-all')
            ->assertOk();

        $tmp = tempnam(sys_get_temp_dir(), 'zip-test-');
        file_put_contents($tmp, $response->streamedContent());

        $zip = new ZipArchive;
        $zip->open($tmp);
        $count = $zip->numFiles;
        $first = $zip->getNameIndex(0);
        $last = $zip->getNameIndex($count - 1);
        $zip->close();
        @unlink($tmp);

        $this->assertSame(8, $count);
        $this->assertSame('01 Passport Copy/passport_copy.pdf', $first);
        $this->assertSame('08 Agreement/agreement.pdf', $last);
    }

    public function test_downloading_the_zip_of_another_agency_candidate_is_refused(): void
    {
        $id = $this->candidateId();
        $this->upload($id, 'medical', 'medical.pdf');

        $other = Agency::create([
            'id' => 'AG-9002',
            'name' => 'Beta Agency',
            'code' => 'BET-9002',
            'address' => '9 Lake Road, Galle',
            'username' => 'tst.beta',
            'contact' => 'Owner',
            'email' => 'beta@example.lk',
            'status' => 'active',
        ]);

        $intruder = User::create([
            'name' => 'Beta Owner',
            'username' => 'beta.owner',
            'email' => 'owner@beta.lk',
            'phone' => '0712000002',
            'password_hash' => password_hash('Passw0rd1', PASSWORD_BCRYPT),
            'role_slug' => 'agency_owner',
            'agency_id' => $other->id,
            'status' => 'active',
        ]);

        $this->app['auth']->forgetGuards();

        $this->withToken(Jwt::sign($intruder->toPublic()))
            ->get('/api/v1/candidates/'.$id.'/documents/download-all')
            ->assertStatus(403);
    }

    /**
     * The live symptom this covers: rows survived a wipe of storage/, so every
     * document looked attached while none of the files were downloadable.
     */
    public function test_a_row_whose_file_vanished_is_reported_instead_of_offered(): void
    {
        $id = $this->candidateId();
        $this->upload($id, 'medical', 'medical.pdf')->assertCreated();
        $this->upload($id, 'passport_copy', 'passport.pdf')->assertCreated();

        $documents = Candidate::find($id)->documents;
        $medical = $documents->firstWhere('type', 'medical');

        // Whatever removed it - a redeploy, a failed write - the row stays.
        Storage::disk('local')->delete($medical->path);

        $listing = $this->withToken($this->token)
            ->getJson('/api/v1/candidates/'.$id.'/documents')
            ->assertOk();

        // The type counts as missing again, so the candidate is not complete.
        $this->assertContains('medical', $listing->json('data.missing'));
        $this->assertFalse($listing->json('data.latest.medical.available'));
        $this->assertTrue($listing->json('data.latest.passport_copy.available'));

        // Downloading it says so rather than failing somewhere deeper.
        $this->withToken($this->token)
            ->getJson('/api/v1/candidates/'.$id.'/documents/'.$medical->id.'/download')
            ->assertStatus(404)
            ->assertJsonPath('message', 'Medical is recorded but its file is not on the server. Attach it again.');

        // The zip still builds from what is left instead of erroring out.
        $response = $this->withToken($this->token)
            ->get('/api/v1/candidates/'.$id.'/documents/download-all')
            ->assertOk();

        $this->assertSame(
            ['01 Passport Copy/passport.pdf'],
            $this->zipEntries($response->streamedContent())
        );
    }

    /**
     * The local disk is configured with 'throw' => false, so an unwritable
     * storage/ used to return false from storeAs and still leave a row behind.
     * That is how the live install ended up full of documents with no files.
     */
    public function test_an_upload_that_cannot_be_written_is_refused_instead_of_recorded(): void
    {
        $id = $this->candidateId();

        Storage::shouldReceive('disk')->andReturn($failing = \Mockery::mock());
        $failing->shouldReceive('putFileAs')->andReturn(false);
        $failing->shouldReceive('exists')->andReturn(false);

        $this->upload($id, 'medical', 'medical.pdf')
            ->assertStatus(500)
            ->assertJsonPath(
                'message',
                'The file could not be saved on the server. Make sure storage/ is writable (permissions 755).'
            );

        // Nothing recorded, so the UI never claims the document is attached.
        $this->assertDatabaseCount('candidate_documents', 0);
    }

    public function test_the_zip_is_refused_when_every_file_has_vanished(): void
    {
        $id = $this->candidateId();
        $this->upload($id, 'medical', 'medical.pdf')->assertCreated();

        foreach (Candidate::find($id)->documents as $document) {
            Storage::disk('local')->delete($document->path);
        }

        $this->withToken($this->token)
            ->getJson('/api/v1/candidates/'.$id.'/documents/download-all')
            ->assertStatus(404)
            ->assertJsonPath(
                'message',
                'Every attached file is missing from the server, so there is nothing to archive. Attach them again.'
            );
    }

    public function test_an_agency_can_only_work_with_candidates(): void
    {
        // Everything outside the candidates module is closed to an agency.
        $this->withToken($this->token)->getJson('/api/v1/agencies')->assertStatus(403);
        $this->withToken($this->token)->getJson('/api/v1/users')->assertStatus(403);
        $this->withToken($this->token)->getJson('/api/v1/roles')->assertStatus(403);

        $this->withToken($this->token)->getJson('/api/v1/candidates')->assertOk();
    }
}
