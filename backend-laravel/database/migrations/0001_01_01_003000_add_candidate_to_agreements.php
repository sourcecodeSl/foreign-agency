<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The candidate a local agency assigns to an agreement it was sent. The
 * employee part of the agreement is filled from that candidate's file.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('agreements', function (Blueprint $table) {
            $table->unsignedInteger('candidate_id')->nullable()->after('sent_to_agency_by')->index();
            $table->dateTime('candidate_assigned_at')->nullable()->after('candidate_id');
        });
    }

    public function down(): void
    {
        Schema::table('agreements', function (Blueprint $table) {
            $table->dropIndex(['candidate_id']);
            $table->dropColumn(['candidate_id', 'candidate_assigned_at']);
        });
    }
};
