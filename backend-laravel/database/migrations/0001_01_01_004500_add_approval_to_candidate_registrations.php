<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A registration waits for a coordinator or the Main Admin.
 *
 * When a local agency puts a candidate up for a foreign company's test, the
 * company does not see them straight away. A coordinator or the Main Admin
 * approves the registration first; only then are the test index numbers
 * handed out and the candidate appears on the company's list. A rejected one
 * goes back to the agency with the reason.
 *
 * Registrations already made are approved: they have their numbers, and the
 * companies are working from them.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('candidate_registrations', function (Blueprint $table) {
            $table->string('approval', 10)->default('pending')->after('company_agency_id');
            $table->dateTime('decided_at')->nullable()->after('approval');
            $table->unsignedInteger('decided_by')->nullable()->after('decided_at');
            $table->string('decision_note', 255)->nullable()->after('decided_by');
            $table->index('approval');
        });

        DB::table('candidate_registrations')->update(['approval' => 'approved', 'decided_at' => now()]);
    }

    public function down(): void
    {
        Schema::table('candidate_registrations', function (Blueprint $table) {
            $table->dropIndex(['approval']);
            $table->dropColumn(['approval', 'decided_at', 'decided_by', 'decision_note']);
        });
    }
};
