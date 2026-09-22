<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The company seal and the signature a foreign company puts on its
 * agreement. Both are pictures on the private disk, printed at the foot of
 * every page of the filled PDF, beside the page number.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('agreements', function (Blueprint $table) {
            $table->string('seal_path', 255)->nullable()->after('salary_nis');
            $table->string('signature_path', 255)->nullable()->after('seal_path');
        });
    }

    public function down(): void
    {
        Schema::table('agreements', function (Blueprint $table) {
            $table->dropColumn(['seal_path', 'signature_path']);
        });
    }
};
