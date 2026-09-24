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
 * Removing a candidate is a soft delete, so the row keeps the passport and
 * NIC. Registering that person again therefore brings the removed file back
 * rather than colliding with it.
 */
class CandidateReRegisterTest extends TestCase
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
        $this->withToken(Jwt::sign($owner->toPublic()));
    }

    private function register(array $overrides = [])
    {
        return $this->postJson('/api/v1/candidates', $overrides + [
            'name' => 'Visal Theekshana',
            'passportNo' => 'N1212231',
            'nicNo' => '200203801790',
            'address' => '45/2/14 Kandakatiya, Kiriwaththuduwa',
            'mobile' => '0781311858',
        ]);
    }

    public function test_registering_a_removed_candidate_again_brings_their_file_back(): void
    {
        Storage::fake('local');

        $first = $this->register()->assertCreated()->json('data.candidate');
        $this->adminPass($first['id']);

        $this->postJson('/api/v1/candidates/'.$first['id'].'/documents', [
            'type' => 'medical',
            'file' => UploadedFile::fake()->create('medical.pdf', 40, 'application/pdf'),
        ])->assertCreated();

        $this->deleteJson('/api/v1/candidates/'.$first['id'])->assertOk();
        $this->assertSoftDeleted('candidates', ['id' => $first['id']]);

        // The same person, registered again - the removed file returns.
        $again = $this->register(['address' => '12 Temple Road, Negombo'])
            ->assertCreated()
            ->assertJsonPath('data.restored', true)
            ->json('data');

        $this->assertSame($first['id'], $again['candidate']['id']);
        $this->assertSame('12 Temple Road, Negombo', $again['candidate']['address']);
        $this->assertCount(1, $again['candidate']['documents']);
        $this->assertSame(1, Candidate::where('passport_no', 'N1212231')->count());

        // And it is listed again, as any live file is.
        $this->getJson('/api/v1/candidates')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_a_candidate_still_on_file_is_refused_as_before(): void
    {
        $this->register()->assertCreated();

        $this->register(['name' => 'Someone Else'])
            ->assertStatus(422)
            ->assertJsonPath('errors.passportNo', 'A candidate with this passport number already exists.');

        $this->assertSame(1, Candidate::count());
    }

    public function test_editing_onto_a_removed_passport_says_what_is_in_the_way(): void
    {
        $removed = $this->register()->assertCreated()->json('data.candidate.id');
        $this->deleteJson('/api/v1/candidates/'.$removed)->assertOk();

        $other = $this->register([
            'name' => 'Kamal Perera',
            'passportNo' => 'N7788990',
            'nicNo' => '199012345678',
        ])->assertCreated()->json('data.candidate.id');

        $this->putJson('/api/v1/candidates/'.$other, ['passportNo' => 'N1212231'])
            ->assertStatus(409)
            ->assertJsonPath(
                'message',
                'A candidate removed earlier holds this passport number or NIC. Register them again to bring that file back.'
            );
    }
}
