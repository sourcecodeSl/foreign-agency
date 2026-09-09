<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Links an agency staff login to the agency record it belongs to.
 *
 * `agency_name` stays for display; `agency_id` is what candidate queries are
 * scoped by, so one agency can never reach another agency's records.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('agency_id', 20)->nullable()->after('agency_name');
            $table->index('agency_id');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex(['agency_id']);
            $table->dropColumn('agency_id');
        });
    }
};
