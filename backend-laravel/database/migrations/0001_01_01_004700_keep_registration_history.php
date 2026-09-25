<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Every company a candidate was sent to stays on record.
 *
 * The company a candidate is tested by is chosen by a coordinator or the Main
 * Admin, never the local agency. When they move a candidate to another
 * company, or send them for a new test after a fail - with the same company
 * or another - the assignment they had is ended rather than changed or
 * deleted: its date, its test numbers and its results stay, and the new one
 * gets new test numbers. That history is what the candidate's report reads.
 *
 * So a candidate may now hold the same company more than once over time
 * (one of them current), and a result belongs to the assignment - the test -
 * it was recorded against, not just to the company.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('candidate_registrations', function (Blueprint $table) {
            $table->dateTime('ended_at')->nullable()->after('decision_note');
            $table->unsignedInteger('ended_by')->nullable()->after('ended_at');
            // moved - to another company; new_test - sent for another test.
            $table->string('end_reason', 20)->nullable()->after('ended_by');
            // The candidate_id foreign key leans on the unique key until this exists.
            $table->index('candidate_id', 'candidate_registrations_candidate_index');
        });
        Schema::table('candidate_registrations', function (Blueprint $table) {
            $table->dropUnique(['candidate_id', 'company_agency_id']);
        });

        Schema::table('candidate_test_results', function (Blueprint $table) {
            $table->unsignedInteger('registration_id')->nullable()->after('company_agency_id');
            $table->index('candidate_id', 'candidate_test_results_candidate_index');
        });

        // Each result to the assignment it was recorded under.
        foreach (DB::table('candidate_test_results')->get() as $row) {
            $registration = DB::table('candidate_registrations')
                ->where('candidate_id', $row->candidate_id)
                ->where('company_agency_id', $row->company_agency_id)
                ->value('id');

            if ($registration) {
                DB::table('candidate_test_results')->where('id', $row->id)->update(['registration_id' => $registration]);
            }
        }

        Schema::table('candidate_test_results', function (Blueprint $table) {
            $table->dropUnique('candidate_results_company_role_unique');
            $table->unique(['registration_id', 'job_role_id'], 'candidate_results_registration_role_unique');
            $table->foreign('registration_id')->references('id')->on('candidate_registrations')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('candidate_test_results', function (Blueprint $table) {
            $table->dropForeign(['registration_id']);
            $table->dropUnique('candidate_results_registration_role_unique');
            $table->unique(['candidate_id', 'company_agency_id', 'job_role_id'], 'candidate_results_company_role_unique');
        });
        Schema::table('candidate_test_results', function (Blueprint $table) {
            $table->dropIndex('candidate_test_results_candidate_index');
            $table->dropColumn('registration_id');
        });

        // Only the current assignment per company can come back under the old key.
        DB::table('candidate_registrations')->whereNotNull('ended_at')->delete();

        Schema::table('candidate_registrations', function (Blueprint $table) {
            $table->unique(['candidate_id', 'company_agency_id']);
        });
        Schema::table('candidate_registrations', function (Blueprint $table) {
            $table->dropIndex('candidate_registrations_candidate_index');
            $table->dropColumn(['ended_at', 'ended_by', 'end_reason']);
        });
    }
};
