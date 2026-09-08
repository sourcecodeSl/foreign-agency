<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('email_verifications', function (Blueprint $table) {
            $table->string('id', 20)->primary();     // e.g. EV-501
            $table->string('name', 120)->default('-');
            $table->string('email', 190);
            $table->string('agency', 150)->default('-');
            $table->enum('status', ['unverified', 'verified', 'bounced'])->default('unverified');
            $table->string('requested_at', 40)->nullable();
            $table->unsignedInteger('attempts')->default(1);
            $table->string('token', 100)->nullable();
            $table->string('verified_at', 40)->nullable();
            $table->string('verified_by', 30)->nullable();

            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('email_verifications');
    }
};
