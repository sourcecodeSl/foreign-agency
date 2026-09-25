<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The candidate's mobile number belongs to the local agency that registered
 * them. A coordinator or the Main Admin registering on the agency's behalf is
 * not asked for it, so the file can be saved without one.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('candidates', function (Blueprint $table) {
            $table->string('mobile', 20)->nullable()->change();
        });
    }

    public function down(): void
    {
        DB::table('candidates')->whereNull('mobile')->update(['mobile' => '']);

        Schema::table('candidates', function (Blueprint $table) {
            $table->string('mobile', 20)->nullable(false)->change();
        });
    }
};
