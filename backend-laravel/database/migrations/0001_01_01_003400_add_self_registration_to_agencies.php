<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * An agency that registered itself from the sign-in page.
 *
 * It applies before it has a login: the phone number it gives is kept on the
 * record until the administrator approves it and issues the credentials, and
 * the username stays empty until then.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('agencies', function (Blueprint $table) {
            $table->string('phone', 20)->nullable()->after('email');
            $table->string('username', 60)->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('agencies', function (Blueprint $table) {
            $table->dropColumn('phone');
            $table->string('username', 60)->nullable(false)->change();
        });
    }
};
