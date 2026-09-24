<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * One result per job category, and registrations blocked by another pass.
 *
 * A local agency puts a candidate up in two or more job categories. The
 * foreign company they are registered for records how each one went - a
 * Tiler fail and a Mason pass are two rows here - and the local agency reads
 * every one of them. candidates.test_result stays as the latest, for the
 * screens that show a single badge.
 *
 * When the person passes with one company, their files registered for other
 * companies (known by NIC) can be blocked outright by that company or the
 * admin side: registration_blocked_* records who did it, and for whom.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('candidate_test_results', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('candidate_id');
            // The foreign company (an agency of type foreign) that tested them.
            $table->string('company_agency_id', 20)->nullable();
            $table->unsignedInteger('job_role_id');
            $table->enum('result', ['pass', 'fail']);
            $table->string('note', 255)->nullable();
            $table->unsignedInteger('recorded_by')->nullable();
            $table->timestamps();

            $table->foreign('candidate_id')->references('id')->on('candidates')->cascadeOnDelete();
            $table->foreign('job_role_id')->references('id')->on('job_roles');

            // One result per trade: recording it again changes it.
            $table->unique(['candidate_id', 'job_role_id']);
            $table->index('company_agency_id');
        });

        Schema::table('candidates', function (Blueprint $table) {
            $table->dateTime('registration_blocked_at')->nullable()->after('test_result_by');
            $table->unsignedInteger('registration_blocked_by')->nullable()->after('registration_blocked_at');
            // The file whose pass the block was made for.
            $table->unsignedInteger('registration_blocked_for')->nullable()->after('registration_blocked_by');
        });

        // A result recorded before this table existed, under the trade it named.
        DB::table('candidates')
            ->whereNotNull('test_result')
            ->whereNotNull('test_result_role_id')
            ->orderBy('id')
            ->each(function ($row) {
                DB::table('candidate_test_results')->insertOrIgnore([
                    'candidate_id' => $row->id,
                    'company_agency_id' => $row->company_agency_id,
                    'job_role_id' => $row->test_result_role_id,
                    'result' => $row->test_result,
                    'note' => $row->test_result_note,
                    'recorded_by' => $row->test_result_by,
                    'created_at' => $row->test_result_at,
                    'updated_at' => $row->test_result_at,
                ]);
            });
    }

    public function down(): void
    {
        Schema::table('candidates', function (Blueprint $table) {
            $table->dropColumn(['registration_blocked_at', 'registration_blocked_by', 'registration_blocked_for']);
        });

        Schema::dropIfExists('candidate_test_results');
    }
};
