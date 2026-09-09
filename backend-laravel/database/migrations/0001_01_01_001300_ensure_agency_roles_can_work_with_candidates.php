<?php

use App\Models\Role;
use Illuminate\Database\Migrations\Migration;

/**
 * An agency login exists to register candidates, so the candidates module has
 * to be open to it.
 *
 * The matrix is editable from the admin panel, which means a live database can
 * drift from what the seeder writes - a role that loses candidates.create stops
 * being able to register anybody at all. This puts the module back the way an
 * agency role needs it.
 *
 * Flags are only ever turned on, and only inside `candidates`: every other
 * module is left exactly as the admin left it.
 */
return new class extends Migration
{
    /** The roles that run an agency and file its candidates. */
    private const SLUGS = ['agency_owner', 'agency_manager'];

    /** What an agency role needs to do its job end to end. */
    private const REQUIRED = ['view', 'create', 'edit', 'delete'];

    public function up(): void
    {
        foreach (Role::whereIn('slug', self::SLUGS)->get() as $role) {
            $permissions = $role->permissions ?? [];
            $candidates = $permissions['candidates'] ?? [];

            foreach (self::REQUIRED as $action) {
                $candidates[$action] = true;
            }

            $permissions['candidates'] = $candidates;
            $role->update(['permissions' => $permissions]);
        }
    }

    /**
     * Nothing to undo: this only restores access the roles are meant to have,
     * and taking it away again would leave an agency unable to work.
     */
    public function down(): void
    {
        // Intentionally empty.
    }
};
