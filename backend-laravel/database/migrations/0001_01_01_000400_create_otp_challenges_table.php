<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Replaces the in-memory OTP challenge Map from the Express backend.
        // PHP is request-per-process, so challenges must be persisted.
        Schema::create('otp_challenges', function (Blueprint $table) {
            $table->string('id', 40)->primary();     // e.g. chg_<hex>
            $table->unsignedInteger('admin_id');
            $table->string('destination', 190);
            $table->enum('channel', ['sms', 'email']);
            $table->json('meta')->nullable();
            $table->string('code', 6);
            $table->unsignedBigInteger('expires_at');    // epoch millis
            $table->unsignedBigInteger('last_sent_at');  // epoch millis
            $table->unsignedInteger('attempts')->default(0);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('otp_challenges');
    }
};
