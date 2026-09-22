<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The monthly salary a foreign company puts on its agreement, in New Israeli
 * Shekels. It takes the place of the amount the paper prints in clause 3a.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('agreements', function (Blueprint $table) {
            $table->decimal('salary_nis', 10, 2)->nullable()->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('agreements', function (Blueprint $table) {
            $table->dropColumn('salary_nis');
        });
    }
};
