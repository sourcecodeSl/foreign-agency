<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The foreign company a candidate is registered to be tested for.
 *
 * It is chosen when the candidate is registered, so the company knows who is
 * coming before any test is booked. It is not the company a pass locks them
 * to - that stays locked_company_id, written only when they pass.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('candidates', function (Blueprint $table) {
            $table->unsignedInteger('company_id')->nullable()->after('agency_id');
            $table->index('company_id');
        });
    }

    public function down(): void
    {
        Schema::table('candidates', function (Blueprint $table) {
            $table->dropIndex(['company_id']);
            $table->dropColumn('company_id');
        });
    }
};
