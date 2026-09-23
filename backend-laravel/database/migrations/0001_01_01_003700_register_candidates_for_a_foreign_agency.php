<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The foreign company a candidate is registered for, and how their test went.
 *
 * The company is an agency of type foreign - the one that signs in and reads
 * its own candidates - not a foreign_companies row, which nobody signs in as.
 * The result is recorded by that company or by the admin side: a pass names
 * the trade it was sat in, which becomes the candidate's profession.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('candidates', function (Blueprint $table) {
            $table->dropIndex(['company_id']);
            $table->dropColumn('company_id');

            $table->string('company_agency_id', 20)->nullable()->after('agency_id');
            $table->enum('test_result', ['pass', 'fail'])->nullable()->after('pool_status');
            $table->unsignedInteger('test_result_role_id')->nullable()->after('test_result');
            $table->string('test_result_note', 255)->nullable()->after('test_result_role_id');
            $table->timestamp('test_result_at')->nullable()->after('test_result_note');
            $table->unsignedInteger('test_result_by')->nullable()->after('test_result_at');

            $table->index('company_agency_id');
        });
    }

    public function down(): void
    {
        Schema::table('candidates', function (Blueprint $table) {
            $table->dropIndex(['company_agency_id']);
            $table->dropColumn([
                'company_agency_id',
                'test_result',
                'test_result_role_id',
                'test_result_note',
                'test_result_at',
                'test_result_by',
            ]);

            $table->unsignedInteger('company_id')->nullable()->after('agency_id');
            $table->index('company_id');
        });
    }
};
