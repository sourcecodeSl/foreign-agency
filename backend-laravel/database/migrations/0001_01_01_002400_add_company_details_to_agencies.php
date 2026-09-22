<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What a foreign company files when it is registered: its registration
 * number, and the lawyer who acts for it.
 *
 * A local agency leaves these empty - it is registered here by name, code and
 * address alone - so every column is nullable and the rule that a foreign
 * company must fill them lives in the controller.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('agencies', function (Blueprint $table) {
            $table->string('registration_no', 60)->nullable()->after('code');
            $table->string('lawyer_name', 150)->nullable()->after('country');
            $table->string('lawyer_id_no', 40)->nullable()->after('lawyer_name');
            $table->string('lawyer_position', 120)->nullable()->after('lawyer_id_no');
        });
    }

    public function down(): void
    {
        Schema::table('agencies', function (Blueprint $table) {
            $table->dropColumn(['registration_no', 'lawyer_name', 'lawyer_id_no', 'lawyer_position']);
        });
    }
};
