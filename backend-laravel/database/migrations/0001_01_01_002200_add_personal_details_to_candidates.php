<?php

use App\Support\Nic;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The personal details a candidate file carries wherever it is registered:
 * first and last name, father's name, date of birth, passport validity,
 * profession and test results.
 *
 * `name` stays as the full name every screen and search already uses; it is
 * built from the first and last name. The date of birth is read from the NIC,
 * so files already on record get theirs here.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('candidates', function (Blueprint $table) {
            $table->string('first_name', 75)->nullable()->after('name');
            $table->string('last_name', 75)->nullable()->after('first_name');
            $table->string('father_name', 150)->nullable()->after('last_name');
            $table->date('date_of_birth')->nullable()->after('nic_key');
            $table->date('passport_expiry')->nullable()->after('passport_no');
            $table->string('profession', 120)->nullable()->after('email');
            $table->string('test_results', 255)->nullable()->after('test_index_no');
        });

        // Removed files too: bringing one back must still have its birthday.
        DB::table('candidates')->whereNotNull('nic_no')->orderBy('id')->each(function ($row) {
            DB::table('candidates')->where('id', $row->id)->update(['date_of_birth' => Nic::birthDate($row->nic_no)]);
        });
    }

    public function down(): void
    {
        Schema::table('candidates', function (Blueprint $table) {
            $table->dropColumn([
                'first_name', 'last_name', 'father_name', 'date_of_birth',
                'passport_expiry', 'profession', 'test_results',
            ]);
        });
    }
};
