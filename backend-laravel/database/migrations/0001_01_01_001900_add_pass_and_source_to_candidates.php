<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Who put a candidate on file, when they passed, and who submitted the profile.
 *
 * A candidate is added either by their agency or, on the agency's behalf, by
 * a coordinator or the Main Admin; `source` records which, so every screen can
 * say where the file came from.
 *
 * Passing is what opens the file for documents and ties the person to one
 * agency. The agency switches it on itself, or a skill test result does.
 * Once the documents are in, a coordinator checks them and submits the whole
 * profile - `submitted_by` is that coordinator.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('candidates', function (Blueprint $table) {
            $table->string('source', 20)->default('agency')->after('created_by');
            $table->dateTime('passed_at')->nullable()->after('locked_at');
            $table->unsignedInteger('passed_by')->nullable()->after('passed_at');
            $table->dateTime('submitted_at')->nullable()->after('status');
            $table->unsignedInteger('submitted_by')->nullable()->after('submitted_at');

            // A passed person is looked up across every agency, which the
            // per-agency unique keys cannot serve.
            $table->index('passport_no');
            $table->index('nic_no');
        });

        // Files already on record: whoever created them says where they came from.
        foreach (['coordinator', 'main_admin'] as $role) {
            DB::table('candidates')
                ->whereIn('created_by', DB::table('users')->where('role_slug', $role)->select('id'))
                ->update(['source' => $role]);
        }

        // A pass recorded by a skill test before this column existed.
        DB::table('candidates')
            ->where('pool_status', 'passed')
            ->whereNull('passed_at')
            ->update(['passed_at' => DB::raw('locked_at')]);
    }

    public function down(): void
    {
        Schema::table('candidates', function (Blueprint $table) {
            $table->dropIndex(['passport_no']);
            $table->dropIndex(['nic_no']);
            $table->dropColumn(['source', 'passed_at', 'passed_by', 'submitted_at', 'submitted_by']);
        });
    }
};
