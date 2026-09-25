<?php

namespace Tests\Feature;

use App\Models\Agency;
use App\Models\JobRole;
use App\Models\User;
use App\Support\Jwt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Each candidate has a test document. The foreign company testing them adds
 * lines to it - only adds - and the local agency that owns the candidate
 * reads it and is told of every new line. It stays with the candidate.
 */
class CandidateTestDocumentTest extends TestCase
{
    use RefreshDatabase;

    private int $phones = 0;

    private string $admin;

    private string $local;

    private string $company;

    private string $other;

    private int $candidate;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        $this->admin = Jwt::sign(User::where('role_slug', 'main_admin')->firstOrFail()->toPublic());

        $this->local = $this->agency('AG-9001', 'Solidrow');
        $this->company = $this->agency('AG-9100', 'Herzl Construction', 'foreign');
        $this->other = $this->agency('AG-9101', 'Haifa Works', 'foreign');

        $role = (int) JobRole::where('name', 'Tiler')->firstOrFail()->id;
        $this->candidate = $this->as($this->local)->postJson('/api/v1/candidates', [
            'firstName' => 'Nimal',
            'lastName' => 'Silva',
            'passportNo' => 'N1122334',
            'nicNo' => '901234567V',
            'address' => '9 Lake Road, Kandy',
            'mobile' => '0779998887',
            'jobRoleIds' => [$role],
        ])->assertCreated()->json('data.candidate.id');

        $this->as($this->admin)->postJson('/api/v1/candidates/'.$this->candidate.'/registrations', [
            'companyAgencyId' => 'AG-9100',
            'jobRoleIds' => [$role],
        ])->assertCreated();
    }

    private function agency(string $id, string $name, string $type = 'local'): string
    {
        Agency::create([
            'id' => $id,
            'name' => $name,
            'code' => strtoupper(substr($name, 0, 3)).'-'.substr($id, 3),
            'type' => $type,
            'country' => $type === 'foreign' ? 'Israel' : null,
            'address' => '1 Main Street, Colombo',
            'username' => strtolower($id).'.owner',
            'contact' => $name.' Owner',
            'email' => strtolower($id).'@example.com',
            'status' => 'active',
        ]);

        $owner = User::create([
            'name' => $name.' Owner',
            'username' => strtolower($id).'.owner',
            'email' => strtolower($id).'@example.com',
            'phone' => '07130000'.str_pad((string) ++$this->phones, 2, '0', STR_PAD_LEFT),
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

    private function url(): string
    {
        return '/api/v1/candidates/'.$this->candidate.'/test-lines';
    }

    public function test_the_company_adds_lines_and_the_agency_reads_them_in_order(): void
    {
        $this->as($this->company)->getJson($this->url())->assertOk()->assertJsonPath('data.canAdd', true);

        $this->as($this->company)->postJson($this->url(), ['body' => 'Practical: tiling a 2m wall - 8/10'])
            ->assertCreated()
            ->assertJsonPath('data.company.name', 'Herzl Construction')
            ->assertJsonPath('message', 'Test line saved. Solidrow has been notified.');
        $this->as($this->company)->postJson($this->url(), ['body' => 'Theory: safety - passed'])->assertCreated();

        $this->as($this->local)->getJson($this->url())
            ->assertOk()
            ->assertJsonPath('data.canAdd', false)
            ->assertJsonCount(2, 'data.lines')
            ->assertJsonPath('data.lines.0.body', 'Practical: tiling a 2m wall - 8/10')
            ->assertJsonPath('data.lines.1.body', 'Theory: safety - passed');

        $this->as($this->admin)->getJson($this->url())->assertOk()->assertJsonCount(2, 'data.lines');
    }

    public function test_only_the_testing_company_adds_and_the_agency_only_reads(): void
    {
        $this->as($this->local)->postJson($this->url(), ['body' => 'x'])->assertForbidden();
        $this->as($this->admin)->postJson($this->url(), ['body' => 'x'])->assertForbidden();
        // A company the candidate is not registered with sees nothing.
        $this->as($this->other)->getJson($this->url())->assertForbidden();
        $this->as($this->other)->postJson($this->url(), ['body' => 'x'])->assertForbidden();

        $this->as($this->company)->postJson($this->url(), ['body' => '   '])->assertStatus(422);
    }

    public function test_the_agency_is_notified_of_every_new_line(): void
    {
        $this->as($this->company)->postJson($this->url(), ['body' => 'Practical: 8/10'])->assertCreated();

        $item = collect($this->as($this->local)->getJson('/api/v1/notifications')->assertOk()->json('data'))
            ->first(fn ($n) => str_starts_with($n['id'], 'test-line-'));

        $this->assertSame('Herzl Construction added a test line for Nimal Silva', $item['title']);
        $this->assertSame('Practical: 8/10', $item['body']);
        $this->assertSame('/candidates/'.$this->candidate.'?test=1', $item['link']);
    }
}
