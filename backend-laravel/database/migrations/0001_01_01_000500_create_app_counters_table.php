<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Sequence counters that were plain module-scope variables in Express
        // (agency = 1047, role = 5, verification = 504).
        Schema::create('app_counters', function (Blueprint $table) {
            $table->string('name', 40)->primary();
            $table->unsignedInteger('value')->default(0);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('app_counters');
    }
};
