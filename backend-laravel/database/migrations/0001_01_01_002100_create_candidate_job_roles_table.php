<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Every trade a candidate can be put up for, not just one.
 *
 * A person who can lay tiles can often do shuttering too. If they fail as a
 * Tiler in the morning they may be tested as a Shuttering Carpenter the same
 * day - under a new test number, but on the same candidate file. This table
 * holds all of their trades; `candidates.job_role_id` stays as the trade
 * they were first registered for.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('candidate_job_roles', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('candidate_id');
            $table->unsignedInteger('job_role_id');
            $table->timestamps();

            $table->foreign('candidate_id')->references('id')->on('candidates')->cascadeOnDelete();
            $table->foreign('job_role_id')->references('id')->on('job_roles')->cascadeOnDelete();

            // A trade is listed once per candidate.
            $table->unique(['candidate_id', 'job_role_id']);
        });

        $now = now()->format('Y-m-d H:i:s');

        // The trade each file was registered for, and every trade already tested.
        $pairs = DB::table('candidates')->whereNotNull('job_role_id')
            ->select('id as candidate_id', 'job_role_id')
            ->union(DB::table('skill_tests')->select('candidate_id', 'job_role_id'))
            ->get();

        foreach ($pairs as $pair) {
            DB::table('candidate_job_roles')->insertOrIgnore([
                'candidate_id' => $pair->candidate_id,
                'job_role_id' => $pair->job_role_id,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('candidate_job_roles');
    }
};
