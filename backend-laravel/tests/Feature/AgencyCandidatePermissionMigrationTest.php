<?php

namespace Tests\Feature;

use App\Models\Agency;
use App\Models\Role;
use App\Models\User;
use App\Support\Jwt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

/**
 * The permission matrix is editable from the admin panel, so a live database
 * can drift away from what the seeder writes. This migration is what puts the
 * candidates module back for the roles that cannot work without it.
 */
class AgencyCandidatePermissionMigrationTest extends TestCase
{
    use RefreshDatabase;

    private const MIGRATION = '0001_01_01_001300_ensure_agency_roles_can_work_with_candidates';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    private function migration(): object
    {
        return require database_path('migrations/'.self::MIGRATION.'.php');
    }

    private function setCandidates(string $slug, array $grid): void
    {
        $role = Role::where('slug', $slug)->firstOrFail();
        $permissions = $role->permissions;
        $permissions['candidates'] = $grid;
        $role->update(['permissions' => $permissions]);
    }

    private function candidates(string $slug): array
    {
        return Role::where('slug', $slug)->firstOrFail()->permissions['candidates'];
    }

    public function test_it_restores_create_for_an_agency_owner_that_lost_it(): void
    {
        // Somebody unticked "create" in the permissions screen.
        $this->setCandidates('agency_owner', [
            'view' => true,
            'create' => false,
            'edit' => true,
            'delete' => true,
        ]);

        $this->migration()->up();

        $this->assertSame(
            ['view' => true, 'create' => true, 'edit' => true, 'delete' => true],
            $this->candidates('agency_owner')
        );
    }

    public function test_it_rebuilds_the_module_when_it_is_missing_entirely(): void
    {
        // An older live database predates the candidates module.
        $role = Role::where('slug', 'agency_manager')->firstOrFail();
        $permissions = $role->permissions;
        unset($permissions['candidates']);
        $role->update(['permissions' => $permissions]);

        $this->migration()->up();

        $this->assertSame(
            ['view' => true, 'create' => true, 'edit' => true, 'delete' => true],
            $this->candidates('agency_manager')
        );
    }

    public function test_it_touches_no_other_module(): void
    {
        $role = Role::where('slug', 'agency_owner')->firstOrFail();

        $edited = $role->permissions;
        $edited['candidates'] = ['view' => true, 'create' => false, 'edit' => false, 'delete' => false];
        $edited['reports'] = ['view' => true, 'create' => false, 'edit' => false, 'delete' => false];
        $edited['agencies'] = ['view' => true, 'create' => false, 'edit' => false, 'delete' => false];
        $role->update(['permissions' => $edited]);

        $this->migration()->up();

        $after = Role::where('slug', 'agency_owner')->firstOrFail()->permissions;

        // Only the candidates module moved.
        $this->assertSame($edited['reports'], $after['reports']);
        $this->assertSame($edited['agencies'], $after['agencies']);
        $this->assertSame($edited['users'], $after['users']);
    }

    public function test_it_leaves_the_admin_and_the_read_only_roles_alone(): void
    {
        $auditorBefore = $this->candidates('auditor');
        $agentBefore = $this->candidates('agent');

        $this->migration()->up();

        // An auditor reviews; an agent registers but does not remove.
        $this->assertSame($auditorBefore, $this->candidates('auditor'));
        $this->assertSame($agentBefore, $this->candidates('agent'));
    }

    public function test_running_it_twice_changes_nothing_further(): void
    {
        $this->setCandidates('agency_owner', ['view' => false, 'create' => false, 'edit' => false, 'delete' => false]);

        $this->migration()->up();
        $once = $this->candidates('agency_owner');

        $this->migration()->up();
        $this->assertSame($once, $this->candidates('agency_owner'));
    }

    public function test_an_agency_owner_can_register_again_after_it_runs(): void
    {
        $agency = Agency::create([
            'id' => 'AG-9001',
            'name' => 'Skyline Manpower',
            'code' => 'SKY-9001',
            'address' => '221B Baker Street, Colombo 03',
            'username' => 'tst.skyline',
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
        $token = Jwt::sign($owner->toPublic());

        $payload = [
            'name' => 'Kamal Perera',
            'passportNo' => 'N7788990',
            'address' => '12 Temple Road, Negombo',
            'mobile' => '0771234567',
        ];

        // The state a drifted live database is in: registering is refused.
        $this->setCandidates('agency_owner', [
            'view' => true,
            'create' => false,
            'edit' => true,
            'delete' => true,
        ]);

        $this->withToken($token)->postJson('/api/v1/candidates', $payload)
            ->assertStatus(403)
            ->assertJsonPath('message', 'You do not have permission to create candidates.');

        $this->migration()->up();

        $this->withToken($token)->postJson('/api/v1/candidates', $payload)
            ->assertCreated()
            ->assertJsonPath('data.candidate.name', 'Kamal Perera');
    }

    public function test_it_is_registered_so_the_upgrade_page_picks_it_up(): void
    {
        Artisan::call('migrate:status', ['--no-interaction' => true]);

        $this->assertStringContainsString(self::MIGRATION, Artisan::output());
    }
}
