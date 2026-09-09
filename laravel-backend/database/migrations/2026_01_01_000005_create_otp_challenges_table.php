<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One row per verification step in flight. Persisting these (rather than
 * keeping them in memory) means the 59-second cooldown survives a restart and
 * works across multiple app servers.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('otp_challenges', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->enum('channel', ['sms', 'email']);
            $table->string('destination', 190);
            // Hashed, so a database leak does not hand out live codes.
            $table->string('code_hash', 255);
            $table->unsignedTinyInteger('attempts')->default(0);
            $table->boolean('phone_verified')->default(false);
            // dateTime rather than timestamp: MariaDB gives a second
            // non-nullable TIMESTAMP column an invalid zero default.
            $table->dateTime('last_sent_at');
            $table->dateTime('expires_at');
            $table->dateTime('consumed_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'channel']);
            $table->index('expires_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('otp_challenges');
    }
};
