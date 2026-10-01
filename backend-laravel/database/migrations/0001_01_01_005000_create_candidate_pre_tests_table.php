<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The local agency's pre-test: before a foreign company's final test, the
 * agency that registered the candidate tests them itself, one job category
 * at a time. Only a pass there lets the admin side send them to a company
 * for that category.
 *
 * One row per attempt, each under its own pre-test index number
 * (PRE-TL00001), apart from the company's final test numbers. A fail may be
 * sat again under a new number; the latest attempt is what counts.
 *
 * Every category a candidate was already sent to a company for, before
 * pre-tests began, counts as passed - with no number, since none was sat -
 * so nothing already under way is held up.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('candidate_pre_tests', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('candidate_id');
            $table->unsignedInteger('job_role_id');
            // Null only for the passes carried over from before pre-tests.
            $table->string('index_no', 20)->nullable()->unique();
            // pending (booked, not sat yet), pass or fail.
            $table->string('result', 10)->default('pending');
            $table->string('note', 255)->nullable();
            $table->unsignedInteger('booked_by')->nullable();
            $table->unsignedInteger('recorded_by')->nullable();
            $table->dateTime('recorded_at')->nullable();
            $table->timestamps();

            $table->foreign('candidate_id')->references('id')->on('candidates')->cascadeOnDelete();
            $table->foreign('job_role_id')->references('id')->on('job_roles')->cascadeOnDelete();
            $table->index(['candidate_id', 'job_role_id']);
            $table->index('result');
        });

        $now = now();
        $carried = DB::table('candidate_registration_roles as rr')
            ->join('candidate_registrations as r', 'r.id', '=', 'rr.registration_id')
            ->where('r.approval', 'approved')
            ->select('r.candidate_id', 'rr.job_role_id')
            ->distinct()
            ->get();

        foreach ($carried as $row) {
            DB::table('candidate_pre_tests')->insert([
                'candidate_id' => $row->candidate_id,
                'job_role_id' => $row->job_role_id,
                'result' => 'pass',
                'note' => 'Sent to a company before pre-tests began.',
                'recorded_at' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('candidate_pre_tests');
        DB::table('app_counters')->where('name', 'like', 'pre_test_%')->delete();
    }
};
