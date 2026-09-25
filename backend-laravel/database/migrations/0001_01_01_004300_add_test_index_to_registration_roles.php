<?php

use App\Models\JobRole;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A test index number for every job category a candidate is put up for.
 *
 * Each trade gets a two-letter code (TL for Tiler, PL for Plumber), and each
 * test under it the next number in that trade's own run: TL00001, TL00002... A
 * candidate who fails as a Tiler and is then tested as a Plumber holds a TL
 * number and a PL number. The foreign company records its result against
 * that number, so it is handed out by the system and never repeats.
 *
 * candidates.test_index_no stays for the numbers typed in by hand before this.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('job_roles', function (Blueprint $table) {
            $table->string('code', 4)->nullable()->unique()->after('slug');
        });

        Schema::table('candidate_registration_roles', function (Blueprint $table) {
            $table->string('test_index_no', 20)->nullable()->unique()->after('job_role_id');
        });

        foreach (DB::table('job_roles')->orderBy('id')->get() as $role) {
            DB::table('job_roles')->where('id', $role->id)->update(['code' => JobRole::makeCode($role->name)]);
        }

        // Every trade already registered gets its number, oldest first.
        $codes = DB::table('job_roles')->pluck('code', 'id');
        $counts = [];

        foreach (DB::table('candidate_registration_roles')->orderBy('id')->get() as $row) {
            $counts[$row->job_role_id] = ($counts[$row->job_role_id] ?? 0) + 1;
            DB::table('candidate_registration_roles')->where('id', $row->id)->update([
                'test_index_no' => JobRole::formatIndex($codes[$row->job_role_id], $counts[$row->job_role_id]),
            ]);
        }

        foreach ($counts as $roleId => $count) {
            DB::table('app_counters')->updateOrInsert(['name' => JobRole::counterName($roleId)], ['value' => $count]);
        }
    }

    public function down(): void
    {
        DB::table('app_counters')->where('name', 'like', 'test_index_%')->delete();

        Schema::table('candidate_registration_roles', function (Blueprint $table) {
            $table->dropUnique(['test_index_no']);
            $table->dropColumn('test_index_no');
        });

        Schema::table('job_roles', function (Blueprint $table) {
            $table->dropUnique(['code']);
            $table->dropColumn('code');
        });
    }
};
