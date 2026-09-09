<?php

namespace Tests\Feature;

use App\Models\Role;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

/**
 * The live database keeps its own permission matrix, so the seeder cannot
 * reach it. This migration is what carries the candidates.delete grant across,
 * and it has to leave every other flag exactly where it found it.
 */
class CandidateDeletePermissionMigrationTest extends TestCase
{
    use RefreshDatabase;

    private const MIGRATION = '0001_01_01_001200_allow_agency_roles_to_delete_candidates';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    /** Puts a role back the way it looked before the grant existed. */
    private function revoke(string $slug): void
    {
        $role = Role::where('slug', $slug)->firstOrFail();
        $permissions = $role->permissions;
        $permissions['candidates']['delete'] = false;
        $role->update(['permissions' => $permissions]);
    }

    private function migration(): object
    {
        return require database_path('migrations/'.self::MIGRATION.'.php');
    }

    public function test_it_grants_candidate_delete_to_the_agency_roles(): void
    {
        foreach (['agency_owner', 'agency_manager'] as $slug) {
            $this->revoke($slug);
        }

        $this->migration()->up();

        foreach (['agency_owner', 'agency_manager'] as $slug) {
            $this->assertTrue(
                Role::where('slug', $slug)->firstOrFail()->permissions['candidates']['delete'],
                $slug.' should be able to delete candidates'
            );
        }
    }

    public function test_it_leaves_every_other_permission_untouched(): void
    {
        $role = Role::where('slug', 'agency_owner')->firstOrFail();

        // An install where the admin has edited the matrix by hand.
        $edited = $role->permissions;
        $edited['candidates']['delete'] = false;
        $edited['candidates']['create'] = false;
        $edited['reports'] = ['view' => true, 'create' => false, 'edit' => false, 'delete' => false];
        $role->update(['permissions' => $edited]);

        $this->migration()->up();

        $after = Role::where('slug', 'agency_owner')->firstOrFail()->permissions;

        $this->assertTrue($after['candidates']['delete']);
        // Only the one flag moved.
        $this->assertFalse($after['candidates']['create']);
        $this->assertSame($edited['reports'], $after['reports']);
        $this->assertSame($edited['users'], $after['users']);
    }

    public function test_an_agent_is_not_granted_the_delete(): void
    {
        $this->migration()->up();

        $this->assertFalse(
            Role::where('slug', 'agent')->firstOrFail()->permissions['candidates']['delete']
        );
    }

    public function test_running_it_twice_changes_nothing_further(): void
    {
        $this->revoke('agency_owner');

        $this->migration()->up();
        $once = Role::where('slug', 'agency_owner')->firstOrFail()->permissions;

        $this->migration()->up();
        $twice = Role::where('slug', 'agency_owner')->firstOrFail()->permissions;

        $this->assertSame($once, $twice);
    }

    public function test_it_can_be_rolled_back(): void
    {
        $this->migration()->up();
        $this->migration()->down();

        $this->assertFalse(
            Role::where('slug', 'agency_owner')->firstOrFail()->permissions['candidates']['delete']
        );
    }

    public function test_it_is_registered_so_artisan_migrate_picks_it_up(): void
    {
        // The web upgrader runs `migrate`, so the file has to be a real
        // migration rather than a script somebody has to remember to call.
        Artisan::call('migrate:status', ['--no-interaction' => true]);

        $this->assertStringContainsString(self::MIGRATION, Artisan::output());
    }
}
