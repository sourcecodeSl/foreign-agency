<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('agencies', function (Blueprint $table) {
            $table->string('id', 20)->primary();     // e.g. AG-1042
            $table->string('name', 150);
            $table->string('code', 30);
            $table->string('address', 255);
            $table->string('username', 60)->unique();
            $table->string('password_hash', 255)->nullable();
            $table->string('contact', 120)->default('-');
            $table->string('email', 190)->default('-');
            $table->unsignedInteger('users')->default(0);
            $table->enum('status', ['pending', 'active', 'deactivated'])->default('pending');
            $table->string('created_at', 30)->nullable();   // stored as date string (YYYY-MM-DD)
            $table->string('created_by', 30)->nullable();
            $table->string('status_changed_at', 40)->nullable();
            $table->string('status_changed_by', 30)->nullable();

            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('agencies');
    }
};
