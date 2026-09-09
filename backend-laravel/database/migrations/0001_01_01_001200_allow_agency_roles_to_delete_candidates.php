<?php

use App\Models\Role;
use Illuminate\Database\Migrations\Migration;

/**
 * Removing a candidate is the agency's own call.
 *
 * The permission matrix is data, not code, so a role seeded before this change
 * keeps its stored grid on every existing install - re-seeding is not an option
 * once an admin has edited permissions. Only the one flag moves here; anything
 * else in the matrix is left exactly as it was found.
 */
return new class extends Migration
{
    /** The roles that run an agency day to day. Agents stay read-and-write. */
    private const SLUGS = ['agency_owner', 'agency_manager'];

    public function up(): void
    {
        $this->setCandidateDelete(true);
    }

    public function down(): void
    {
        $this->setCandidateDelete(false);
    }

    private function setCandidateDelete(bool $allowed): void
    {
        foreach (Role::whereIn('slug', self::SLUGS)->get() as $role) {
            $permissions = $role->permissions ?? [];

            // An agency role with no candidates entry at all predates the
            // module; give it the grid the seeder would have written.
            $candidates = $permissions['candidates'] ?? [
                'view' => true,
                'create' => true,
                'edit' => true,
            ];
            $candidates['delete'] = $allowed;
            $permissions['candidates'] = $candidates;

            $role->update(['permissions' => $permissions]);
        }
    }
};
