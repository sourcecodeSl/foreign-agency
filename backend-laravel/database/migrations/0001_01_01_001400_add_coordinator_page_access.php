<?php

use App\Models\Role;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Coordinators: people the Main Admin adds to help run the system, each opened
 * to the pages they need (see App\Support\PageAccess).
 *
 * The pages are kept on the login itself. The role exists so the Users and
 * User Types screens can name it; it is a system role with an empty matrix,
 * because a coordinator's access is never read from one.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('users', 'page_access')) {
            Schema::table('users', function (Blueprint $table) {
                $table->json('page_access')->nullable()->after('agency_id');
            });
        }

        DB::table('roles')->insertOrIgnore([
            'id' => 'RL-CO',
            'name' => 'Coordinator',
            'slug' => 'coordinator',
            'description' => 'Helps run the system; the Main Admin chooses which pages each coordinator can open.',
            'is_system' => true,
            'permissions' => json_encode(Role::emptyMatrix()),
        ]);
    }

    public function down(): void
    {
        DB::table('roles')->where('id', 'RL-CO')->delete();

        if (Schema::hasColumn('users', 'page_access')) {
            Schema::table('users', function (Blueprint $table) {
                $table->dropColumn('page_access');
            });
        }
    }
};
