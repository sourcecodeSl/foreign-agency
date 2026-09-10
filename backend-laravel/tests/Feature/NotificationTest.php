<?php

namespace Tests\Feature;

use App\Models\Agency;
use App\Models\Candidate;
use App\Models\User;
use App\Support\Jwt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The bell lists what is waiting on the person signed in: agencies to approve
 * and files to review for the administrator, the agency's own files for an
 * agency - never another agency's.
 */
class NotificationTest extends TestCase
{
    use RefreshDatabase;

    private string $admin;

    private string $skyline;

    private string $harbour;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();

        $this->skyline = $this->agencyWithOwner('AG-9001', 'Skyline Manpower', 'skyline', '0712000001');
        $this->harbour = $this->agencyWithOwner('AG-9002', 'Harbour Recruiters', 'harbour', '0712000002');

        $this->app['auth']->forgetGuards();
        $this->admin = Jwt::sign(User::where('role_slug', 'main_admin')->first()->toPublic());
    }

    /** An approved agency and its owner login, handing back the owner's token. */
    private function agencyWithOwner(string $id, string $name, string $slug, string $phone): string
    {
        Agency::create([
            'id' => $id,
            'name' => $name,
            'code' => strtoupper(substr($slug, 0, 3)).'-'.substr($id, 3),
            'address' => '221B Baker Street, Colombo 03',
            'username' => $slug.'.owner',
            'contact' => 'Nadia Perera',
            'email' => 'owner@'.$slug.'.lk',
            'status' => 'active',
            'status_changed_at' => now()->toIso8601String(),
        ]);

        $owner = User::create([
            'name' => 'Nadia Perera',
            'username' => $slug.'.owner',
            'email' => 'owner@'.$slug.'.lk',
            'phone' => $phone,
            'password_hash' => password_hash('Passw0rd1', PASSWORD_BCRYPT),
            'role_slug' => 'agency_owner',
            'agency_id' => $id,
            'status' => 'active',
        ]);

        $this->app['auth']->forgetGuards();

        return Jwt::sign($owner->toPublic());
    }

    private function register(string $token, string $name, string $passport): int
    {
        return $this->withToken($token)->postJson('/api/v1/candidates', [
            'name' => $name,
            'passportNo' => $passport,
            'address' => '12 Temple Road, Negombo',
            'mobile' => '0771234567',
        ])->assertCreated()->json('data.candidate.id');
    }

    /** The bell's items for one token, keyed by id => title. */
    private function bell(string $token): array
    {
        return collect($this->withToken($token)->getJson('/api/v1/notifications')->assertOk()->json('data'))
            ->pluck('title', 'id')
            ->all();
    }

    public function test_the_administrator_sees_agencies_to_approve_and_files_to_review(): void
    {
        $new = $this->register($this->skyline, 'Kamal Perera', 'N1000001');
        $submitted = $this->register($this->skyline, 'Nimal Silva', 'N1000002');
        Candidate::whereKey($submitted)->update(['status' => 'submitted']);

        $bell = $this->bell($this->admin);

        // BlueWave Media is seeded as a pending agency.
        $this->assertSame('BlueWave Media is awaiting approval', $bell['agency-pending-AG-1042'] ?? null);
        $this->assertSame('Nimal Silva was submitted for review', $bell['candidate-submitted-'.$submitted] ?? null);
        $this->assertSame('New candidate: Kamal Perera', $bell['candidate-new-'.$new] ?? null);
    }

    public function test_an_agency_sees_only_its_own_files(): void
    {
        $draft = $this->register($this->skyline, 'Kamal Perera', 'N1000001');
        $approved = $this->register($this->skyline, 'Nimal Silva', 'N1000002');
        $elsewhere = $this->register($this->harbour, 'Sunil Fernando', 'N1000003');

        $this->withToken($this->admin)
            ->patchJson('/api/v1/candidates/'.$approved.'/status', ['status' => 'approved'])
            ->assertOk();

        $bell = $this->bell($this->skyline);

        $this->assertSame('Kamal Perera is missing 8 documents', $bell['candidate-missing-'.$draft] ?? null);
        $this->assertSame('Nimal Silva was approved', $bell['candidate-decided-'.$approved] ?? null);
        $this->assertSame('Your agency is now active', $bell['agency-active-AG-9001'] ?? null);

        // Nothing from another agency, and nothing meant for the administrator.
        $this->assertArrayNotHasKey('candidate-missing-'.$elsewhere, $bell);
        $this->assertArrayNotHasKey('agency-pending-AG-1042', $bell);
    }

    public function test_the_bell_needs_a_signed_in_account(): void
    {
        $this->getJson('/api/v1/notifications')->assertStatus(401);
    }
}
