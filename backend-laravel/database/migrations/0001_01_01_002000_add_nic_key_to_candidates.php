<?php

use App\Support\Nic;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * One key per person, read from the NIC in whichever format it was written.
 *
 * A candidate is identified across agencies by NIC: once they pass with one
 * agency, every other agency's file for the same NIC is blocked, and no
 * other agency can register them. The old and new NIC formats of the same
 * person share this key, so writing it the other way round does not slip by.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('candidates', function (Blueprint $table) {
            $table->string('nic_key', 12)->nullable()->after('nic_no');
            $table->index('nic_key');
        });

        // Removed files too: bringing one back must still find its person.
        DB::table('candidates')->whereNotNull('nic_no')->orderBy('id')->each(function ($row) {
            DB::table('candidates')->where('id', $row->id)->update(['nic_key' => Nic::key($row->nic_no)]);
        });
    }

    public function down(): void
    {
        Schema::table('candidates', function (Blueprint $table) {
            $table->dropIndex(['nic_key']);
            $table->dropColumn('nic_key');
        });
    }
};
