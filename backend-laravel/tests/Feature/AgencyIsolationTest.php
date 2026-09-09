<?php

namespace Tests\Feature;

use App\Models\Agency;
use App\Models\Role;
use App\Models\User;
use App\Support\Jwt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * An agency login must never see or touch another agency.
 *
 * Two layers are checked. The permission matrix closes the agencies module to
 * agency roles outright, and the controller scopes by agency on top of that -
 * so a matrix that is later mis-edited still cannot leak another agency.
 */
class AgencyIsolationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
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

    /** Re-opens the module for a role, to exercise the controller scoping. */
    private function grantAgenciesModule(string $slug): void
    {
        $role = Role::where('slug', $slug)->firstOrFail();
        $permissions = $role->permissions;
        $permissions['agencies'] = ['view' => true, 'create' => false, 'edit' => true, 'delete' => false];
        $role->update(['permissions' => $permissions]);
    }

    public function test_an_agency_has_no_access_to_the_agencies_module(): void
    {
        $alpha = $this->makeAgency('AG-9001', 'Alpha Agency', 'tst.alpha');
        $token = $this->ownerToken($alpha, 'alpha.owner');

        // Registering candidates is the whole job; agencies are admin territory.
        $this->withToken($token)->getJson('/api/v1/agencies')->assertStatus(403);
        $this->withToken($token)->getJson('/api/v1/agencies/counts')->assertStatus(403);
        $this->withToken($token)->getJson('/api/v1/agencies/AG-9001')->assertStatus(403);
    }

    public function test_even_with_the_module_granted_an_agency_only_sees_itself(): void
    {
        $alpha = $this->makeAgency('AG-9001', 'Alpha Agency', 'tst.alpha');
        $this->makeAgency('AG-9002', 'Beta Agency', 'tst.beta');
        $this->grantAgenciesModule('agency_owner');

        $rows = $this->withToken($this->ownerToken($alpha, 'alpha.owner'))
            ->getJson('/api/v1/agencies')
            ->assertOk()
            ->json('data');

        $this->assertCount(1, $rows);
        $this->assertSame('AG-9001', $rows[0]['id']);
    }

    public function test_the_admin_still_sees_every_agency(): void
    {
        $this->makeAgency('AG-9001', 'Alpha Agency', 'tst.alpha');
        $this->makeAgency('AG-9002', 'Beta Agency', 'tst.beta');

        $rows = $this->withToken($this->adminToken())
            ->getJson('/api/v1/agencies')
            ->assertOk()
            ->json('data');

        // The four seeded demo agencies plus the two created here.
        $this->assertGreaterThanOrEqual(6, count($rows));
    }

    public function test_an_agency_cannot_read_another_agency(): void
    {
        $this->grantAgenciesModule('agency_owner');
        $alpha = $this->makeAgency('AG-9001', 'Alpha Agency', 'tst.alpha');
        $this->makeAgency('AG-9002', 'Beta Agency', 'tst.beta');

        $this->withToken($this->ownerToken($alpha, 'alpha.owner'))
            ->getJson('/api/v1/agencies/AG-9002')
            ->assertStatus(403);
    }

    public function test_an_agency_cannot_edit_another_agency(): void
    {
        $this->grantAgenciesModule('agency_owner');
        $alpha = $this->makeAgency('AG-9001', 'Alpha Agency', 'tst.alpha');
        $this->makeAgency('AG-9002', 'Beta Agency', 'tst.beta');

        $this->withToken($this->ownerToken($alpha, 'alpha.owner'))
            ->putJson('/api/v1/agencies/AG-9002', ['name' => 'Hijacked Agency'])
            ->assertStatus(403);

        $this->assertSame('Beta Agency', Agency::find('AG-9002')->name);
    }

    public function test_an_agency_cannot_reset_another_agency_credentials(): void
    {
        $this->grantAgenciesModule('agency_owner');
        $alpha = $this->makeAgency('AG-9001', 'Alpha Agency', 'tst.alpha');
        $beta = $this->makeAgency('AG-9002', 'Beta Agency', 'tst.beta');
        $before = $beta->password_hash;

        $this->withToken($this->ownerToken($alpha, 'alpha.owner'))
            ->postJson('/api/v1/agencies/AG-9002/credentials/reset')
            ->assertStatus(403);

        $this->assertSame($before, Agency::find('AG-9002')->password_hash);
    }

    public function test_an_agency_cannot_reset_even_its_own_credentials(): void
    {
        $this->grantAgenciesModule('agency_owner');
        $alpha = $this->makeAgency('AG-9001', 'Alpha Agency', 'tst.alpha');

        // Issuing credentials stays with the administrator.
        $this->withToken($this->ownerToken($alpha, 'alpha.owner'))
            ->postJson('/api/v1/agencies/AG-9001/credentials/reset')
            ->assertStatus(403);
    }

    public function test_an_agency_cannot_approve_or_deactivate_itself(): void
    {
        $this->grantAgenciesModule('agency_owner');
        $alpha = $this->makeAgency('AG-9001', 'Alpha Agency', 'tst.alpha');

        $this->withToken($this->ownerToken($alpha, 'alpha.owner'))
            ->patchJson('/api/v1/agencies/AG-9001/status', ['status' => 'active'])
            ->assertStatus(403);
    }

    public function test_agency_counts_do_not_leak_platform_totals(): void
    {
        $this->grantAgenciesModule('agency_owner');
        $alpha = $this->makeAgency('AG-9001', 'Alpha Agency', 'tst.alpha');
        $this->makeAgency('AG-9002', 'Beta Agency', 'tst.beta');

        $counts = $this->withToken($this->ownerToken($alpha, 'alpha.owner'))
            ->getJson('/api/v1/agencies/counts')
            ->assertOk()
            ->json('data');

        $this->assertSame(1, $counts['all']);
    }

    public function test_editing_its_own_profile_needs_the_module_granted(): void
    {
        $alpha = $this->makeAgency('AG-9001', 'Alpha Agency', 'tst.alpha');

        // Closed by default - an agency only registers candidates.
        $this->withToken($this->ownerToken($alpha, 'alpha.owner'))
            ->putJson('/api/v1/agencies/AG-9001', ['address' => '9 New Road, Colombo 07'])
            ->assertStatus(403);

        // Granted, it may edit its own record and no other.
        $this->grantAgenciesModule('agency_owner');

        $this->withToken($this->ownerToken($alpha, 'alpha.owner2'))
            ->putJson('/api/v1/agencies/AG-9001', ['address' => '9 New Road, Colombo 07'])
            ->assertOk();

        $this->assertSame('9 New Road, Colombo 07', Agency::find('AG-9001')->address);
    }
}
