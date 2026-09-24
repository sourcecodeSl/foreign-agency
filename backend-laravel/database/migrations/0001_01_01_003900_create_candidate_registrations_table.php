<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A candidate registered with more than one foreign company.
 *
 * Until they pass, the local agency may put the same candidate up with any
 * number of foreign companies, each for the job categories that company tests
 * them in. Once they pass with one, every other registration stops being
 * valid - that is worked out from the pass, not stored.
 *
 * candidates.company_agency_id stays: before a pass it is the company they
 * were first registered for, after it the company that holds the pass. A
 * result is now kept per company and category, so the same trade failed with
 * one company can still be sat with another.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('candidate_registrations', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('candidate_id');
            // The foreign company: an agency of type foreign.
            $table->string('company_agency_id', 20);
            $table->unsignedInteger('created_by')->nullable();
            $table->timestamps();

            $table->foreign('candidate_id')->references('id')->on('candidates')->cascadeOnDelete();
            $table->unique(['candidate_id', 'company_agency_id']);
            $table->index('company_agency_id');
        });

        Schema::create('candidate_registration_roles', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('registration_id');
            $table->unsignedInteger('job_role_id');
            $table->timestamps();

            $table->foreign('registration_id')->references('id')->on('candidate_registrations')->cascadeOnDelete();
            $table->foreign('job_role_id')->references('id')->on('job_roles')->cascadeOnDelete();
            $table->unique(['registration_id', 'job_role_id']);
        });

        // One result per company and trade. The new key comes first: on MySQL
        // the candidate foreign key leans on the old one until it exists.
        Schema::table('candidate_test_results', function (Blueprint $table) {
            $table->unique(['candidate_id', 'company_agency_id', 'job_role_id'], 'candidate_results_company_role_unique');
        });
        Schema::table('candidate_test_results', function (Blueprint $table) {
            $table->dropUnique(['candidate_id', 'job_role_id']);
        });

        $now = now()->format('Y-m-d H:i:s');

        // Each file already registered for a company keeps it, with its trades.
        DB::table('candidates')->whereNotNull('company_agency_id')->orderBy('id')->each(function ($row) use ($now) {
            $registrationId = DB::table('candidate_registrations')->insertGetId([
                'candidate_id' => $row->id,
                'company_agency_id' => $row->company_agency_id,
                'created_by' => $row->created_by,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            foreach (DB::table('candidate_job_roles')->where('candidate_id', $row->id)->pluck('job_role_id') as $roleId) {
                DB::table('candidate_registration_roles')->insertOrIgnore([
                    'registration_id' => $registrationId,
                    'job_role_id' => $roleId,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        });
    }

    public function down(): void
    {
        Schema::table('candidate_test_results', function (Blueprint $table) {
            $table->unique(['candidate_id', 'job_role_id']);
        });
        Schema::table('candidate_test_results', function (Blueprint $table) {
            $table->dropUnique('candidate_results_company_role_unique');
        });

        Schema::dropIfExists('candidate_registration_roles');
        Schema::dropIfExists('candidate_registrations');
    }
};
