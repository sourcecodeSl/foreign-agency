<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A candidate's test document: one line per thing a foreign company wrote
 * about the test, oldest first.
 *
 * It belongs to the candidate, not to one assignment, so it goes with them
 * from company to company and stays as long as the candidate file does. A
 * line is only ever added - never changed or taken back.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('candidate_test_lines', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('candidate_id');
            // The foreign company that wrote it.
            $table->string('company_agency_id', 20)->nullable();
            $table->text('body');
            $table->unsignedInteger('recorded_by')->nullable();
            $table->timestamps();

            $table->foreign('candidate_id')->references('id')->on('candidates')->cascadeOnDelete();
            $table->foreign('company_agency_id')->references('id')->on('agencies')->nullOnDelete();
            $table->foreign('recorded_by')->references('id')->on('users')->nullOnDelete();
            $table->index(['candidate_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('candidate_test_lines');
    }
};
