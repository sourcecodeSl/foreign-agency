<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Agreements a foreign company works with from its own login: the PDFs it
 * uploads and the copies it fills are its own, and no other company sees
 * them. Empty for what the Main Admin or a coordinator uploads.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('agreement_templates', function (Blueprint $table) {
            $table->string('agency_id', 20)->nullable()->after('layout')->index();
        });

        Schema::table('agreements', function (Blueprint $table) {
            $table->string('agency_id', 20)->nullable()->after('template_id')->index();
        });
    }

    public function down(): void
    {
        Schema::table('agreements', function (Blueprint $table) {
            $table->dropIndex(['agency_id']);
            $table->dropColumn('agency_id');
        });

        Schema::table('agreement_templates', function (Blueprint $table) {
            $table->dropIndex(['agency_id']);
            $table->dropColumn('agency_id');
        });
    }
};
