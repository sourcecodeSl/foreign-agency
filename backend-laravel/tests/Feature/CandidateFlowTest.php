<?php

namespace Tests\Feature;

use App\Models\Agency;
use App\Models\Candidate;
use App\Models\Role;
use App\Models\User;
use App\Support\DocumentType;
use App\Support\Jwt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Candidate registration and document uploads.
 *
 * Candidates never sign in, so no OTP appears anywhere here - the agency staff
 * member is already authenticated and simply files the record.
 */
class CandidateFlowTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    private function agency(string $id, string $name, string $username): Agency
    {
        return Agency::create([
            'id' => $id,
            'name' => $name,
            'code' => strtoupper(substr($name, 0, 3)).'-'.substr($id, 3),
            'address' => '221B Baker Street, Colombo 03',
            'username' => $username,
            'contact' => 'Owner',
            'email' => $username.'@example.lk',
            'status' => 'active',
        ]);
    }

    /** Builds a token directly - the OTP flow is covered by its own test. */
    private function tokenFor(string $roleSlug, ?string $agencyId, string $email): string
    {
        $user = User::create([
            'name' => 'Test '.$roleSlug,
            'email' => $email,
            'phone' => '07'.random_int(10000000, 99999999),
            'password_hash' => password_hash('Passw0rd1', PASSWORD_BCRYPT),
            'role_slug' => $roleSlug,
            'agency_id' => $agencyId,
            'status' => 'active',
        ]);

        return Jwt::sign($user->toPublic());
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Kamal Perera',
            'passportNo' => 'N1234567',
            'nicNo' => '901234567V',
            'address' => '12 Temple Road, Negombo',
            'mobile' => '0771234567',
            'email' => 'kamal@example.com',
        ], $overrides);
    }

    public function test_document_types_lists_the_eight_required_documents(): void
    {
        $this->agency('AG-9001', 'Skyline Marketing', 'tst.skyline');
        $token = $this->tokenFor('agency_owner', 'AG-9001', 'owner@skyline.lk');

        $types = $this->withToken($token)
            ->getJson('/api/v1/candidates/document-types')
            ->assertOk()
            ->json('data');

        $this->assertCount(8, $types);
        $this->assertSame([
            'passport_copy', 'online_police_report', 'medical',
            'affidavit_english', 'affidavit_sinhala',
            'family_affidavit_english', 'family_affidavit_sinhala', 'agreement',
        ], array_column($types, 'value'));
    }

    public function test_agency_registers_a_candidate_and_uploads_every_document(): void
    {
        Storage::fake('local');
        $this->agency('AG-9001', 'Skyline Marketing', 'tst.skyline');
        $token = $this->tokenFor('agency_owner', 'AG-9001', 'owner@skyline.lk');

        $candidate = $this->withToken($token)
            ->postJson('/api/v1/candidates', $this->payload())
            ->assertCreated()
            ->json('data.candidate');

        $this->assertSame('AG-9001', $candidate['agencyId']);
        $this->assertSame('draft', $candidate['status']);
        $this->assertCount(8, $candidate['missingDocuments']);

        foreach (DocumentType::cases() as $type) {
            $this->withToken($token)->postJson(
                '/api/v1/candidates/'.$candidate['id'].'/documents',
                [
                    'type' => $type->value,
                    'file' => UploadedFile::fake()->create($type->value.'.pdf', 120, 'application/pdf'),
                ]
            )->assertCreated();
        }

        $documents = $this->withToken($token)
            ->getJson('/api/v1/candidates/'.$candidate['id'].'/documents')
            ->assertOk()->json('data');

        $this->assertCount(8, $documents['documents']);
        $this->assertSame([], $documents['missing']);

        // Complete set, so it can go forward for review.
        $this->withToken($token)
            ->patchJson('/api/v1/candidates/'.$candidate['id'].'/status', ['status' => 'submitted'])
            ->assertOk()
            ->assertJsonPath('data.status', 'submitted');
    }

    public function test_bulk_upload_accepts_several_documents_at_once(): void
    {
        Storage::fake('local');
        $this->agency('AG-9001', 'Skyline Marketing', 'tst.skyline');
        $token = $this->tokenFor('agency_owner', 'AG-9001', 'owner@skyline.lk');

        $id = $this->withToken($token)->postJson('/api/v1/candidates', $this->payload())
            ->assertCreated()->json('data.candidate.id');

        $response = $this->withToken($token)->postJson('/api/v1/candidates/'.$id.'/documents/bulk', [
            'documents' => [
                'passport_copy' => UploadedFile::fake()->create('p.pdf', 40, 'application/pdf'),
                'medical' => UploadedFile::fake()->create('m.pdf', 40, 'application/pdf'),
                'agreement' => UploadedFile::fake()->create('a.pdf', 40, 'application/pdf'),
            ],
        ])->assertCreated();

        $this->assertCount(3, $response->json('data.documents'));
        $this->assertCount(5, $response->json('data.missing'));
    }

    public function test_submitting_is_blocked_until_every_document_is_attached(): void
    {
        Storage::fake('local');
        $this->agency('AG-9001', 'Skyline Marketing', 'tst.skyline');
        $token = $this->tokenFor('agency_owner', 'AG-9001', 'owner@skyline.lk');

        $id = $this->withToken($token)->postJson('/api/v1/candidates', $this->payload())
            ->assertCreated()->json('data.candidate.id');

        $this->withToken($token)
            ->patchJson('/api/v1/candidates/'.$id.'/status', ['status' => 'submitted'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Upload every required document before submitting.');
    }

    public function test_an_agency_cannot_reach_another_agency_candidate(): void
    {
        $this->agency('AG-9001', 'Alpha Agency', 'tst.alpha');
        $this->agency('AG-9002', 'Beta Agency', 'tst.beta');

        $tokenA = $this->tokenFor('agency_owner', 'AG-9001', 'owner@alpha.lk');

        $id = $this->withToken($tokenA)->postJson('/api/v1/candidates', $this->payload())
            ->assertCreated()->json('data.candidate.id');

        // Fresh guard state: a new token must not inherit the previous user.
        $tokenB = $this->tokenFor('agency_owner', 'AG-9002', 'owner@beta.lk');

        $this->withToken($tokenB)
            ->getJson('/api/v1/candidates/'.$id)
            ->assertStatus(403)
            ->assertJsonPath('message', 'This candidate belongs to another agency.');

        // It must not appear in agency B's own list either.
        $this->withToken($tokenB)->getJson('/api/v1/candidates')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_main_admin_sees_candidates_across_agencies(): void
    {
        $this->agency('AG-9001', 'Alpha Agency', 'tst.alpha');
        $this->agency('AG-9002', 'Beta Agency', 'tst.beta');

        $tokenA = $this->tokenFor('agency_owner', 'AG-9001', 'owner@alpha.lk');
        $this->withToken($tokenA)->postJson('/api/v1/candidates', $this->payload())->assertCreated();

        $tokenB = $this->tokenFor('agency_owner', 'AG-9002', 'owner@beta.lk');
        $this->withToken($tokenB)->postJson('/api/v1/candidates', $this->payload([
            'passportNo' => 'N9999999', 'nicNo' => '912345678V',
        ]))->assertCreated();

        $admin = $this->tokenFor('main_admin', null, 'admin@example.com');
        $this->withToken($admin)->getJson('/api/v1/candidates')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_duplicate_passport_inside_one_agency_is_rejected(): void
    {
        $this->agency('AG-9001', 'Skyline Marketing', 'tst.skyline');
        $token = $this->tokenFor('agency_owner', 'AG-9001', 'owner@skyline.lk');

        $this->withToken($token)->postJson('/api/v1/candidates', $this->payload())->assertCreated();

        $this->withToken($token)->postJson('/api/v1/candidates', $this->payload())
            ->assertStatus(422)
            ->assertJsonPath('errors.passportNo', 'A candidate with this passport number already exists.');
    }

    public function test_the_same_person_may_exist_under_two_agencies(): void
    {
        $this->agency('AG-9001', 'Alpha Agency', 'tst.alpha');
        $this->agency('AG-9002', 'Beta Agency', 'tst.beta');

        $tokenA = $this->tokenFor('agency_owner', 'AG-9001', 'owner@alpha.lk');
        $this->withToken($tokenA)->postJson('/api/v1/candidates', $this->payload())->assertCreated();

        // Uniqueness is scoped per agency, so this must succeed.
        $tokenB = $this->tokenFor('agency_owner', 'AG-9002', 'owner@beta.lk');
        $this->withToken($tokenB)->postJson('/api/v1/candidates', $this->payload())->assertCreated();

        $this->assertDatabaseCount('candidates', 2);
    }

    public function test_invalid_candidate_details_are_rejected_field_by_field(): void
    {
        $this->agency('AG-9001', 'Skyline Marketing', 'tst.skyline');
        $token = $this->tokenFor('agency_owner', 'AG-9001', 'owner@skyline.lk');

        $this->withToken($token)->postJson('/api/v1/candidates', [
            'name' => 'Ab',
            'passportNo' => 'bad passport!',
            'nicNo' => '123',
            'address' => 'x',
            'mobile' => 'abc',
        ])->assertStatus(422)
            ->assertJsonStructure(['errors' => ['name', 'passportNo', 'nicNo', 'address', 'mobile']]);
    }

    public function test_candidate_routes_require_authentication(): void
    {
        $this->getJson('/api/v1/candidates')->assertStatus(401);
        $this->postJson('/api/v1/candidates', $this->payload())->assertStatus(401);
    }

    public function test_a_role_without_candidate_permission_is_refused(): void
    {
        $this->agency('AG-9001', 'Skyline Marketing', 'tst.skyline');

        // Strip the candidates grant from agency_owner for this test.
        $role = Role::where('slug', 'agency_owner')->firstOrFail();
        $permissions = $role->permissions;
        $permissions['candidates'] = ['view' => false, 'create' => false, 'edit' => false, 'delete' => false];
        $role->update(['permissions' => $permissions]);

        $token = $this->tokenFor('agency_owner', 'AG-9001', 'owner@skyline.lk');

        $this->withToken($token)->getJson('/api/v1/candidates')->assertStatus(403);
    }

    public function test_documents_are_not_stored_in_a_public_directory(): void
    {
        Storage::fake('local');
        $this->agency('AG-9001', 'Skyline Marketing', 'tst.skyline');
        $token = $this->tokenFor('agency_owner', 'AG-9001', 'owner@skyline.lk');

        $id = $this->withToken($token)->postJson('/api/v1/candidates', $this->payload())
            ->assertCreated()->json('data.candidate.id');

        $this->withToken($token)->postJson('/api/v1/candidates/'.$id.'/documents', [
            'type' => 'passport_copy',
            'file' => UploadedFile::fake()->create('passport.pdf', 50, 'application/pdf'),
        ])->assertCreated();

        $document = Candidate::find($id)->documents()->firstOrFail();

        // Path is scoped by agency and candidate, and the API never leaks it.
        $this->assertStringStartsWith('candidates/AG-9001/'.$id.'/', $document->path);
        Storage::disk('local')->assertExists($document->path);
        $this->assertArrayNotHasKey('path', $document->toPublic());
    }
}
