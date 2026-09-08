<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('roles', function (Blueprint $table) {
            $table->string('id', 10)->primary();     // e.g. RL-01
            $table->string('name', 120);
            $table->string('slug', 60)->unique();
            $table->string('description', 255)->nullable();
            $table->boolean('is_system')->default(false);
            // Matrix: { module: { view, create, edit, delete } }
            $table->json('permissions')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('roles');
    }
};
