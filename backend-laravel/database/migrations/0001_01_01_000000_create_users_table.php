<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name', 120);
            $table->string('email', 190)->unique();
            $table->string('phone', 20)->unique();
            // bcrypt hash, never the plain password
            $table->string('password_hash', 255);
            $table->string('role_slug', 50)->default('agent');
            $table->string('agency_name', 150)->nullable();
            $table->enum('status', ['pending', 'active', 'deactivated'])->default('pending');
            $table->dateTime('email_verified_at')->nullable();
            $table->dateTime('phone_verified_at')->nullable();
            $table->dateTime('last_login_at')->nullable();
            $table->timestamps();

            $table->index('role_slug');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};
