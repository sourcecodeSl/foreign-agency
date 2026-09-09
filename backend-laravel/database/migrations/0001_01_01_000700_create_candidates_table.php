<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Candidates (students) are registered by an agency and never sign in, so
 * there is no password and no OTP anywhere in this table.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('candidates', function (Blueprint $table) {
            $table->increments('id');
            // agencies.id is a string key such as AG-1042.
            $table->string('agency_id', 20);
            $table->string('name', 150);
            $table->string('passport_no', 30);
            $table->string('nic_no', 20);
            $table->string('address', 255);
            $table->string('mobile', 20);
            $table->string('email', 190)->nullable();
            $table->enum('status', ['draft', 'submitted', 'approved', 'rejected'])->default('draft');
            $table->text('notes')->nullable();
            $table->unsignedInteger('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->foreign('agency_id')->references('id')->on('agencies')->cascadeOnDelete();

            // Passport and NIC identify a person, so they must not repeat
            // inside the roster of one agency.
            $table->unique(['agency_id', 'passport_no']);
            $table->unique(['agency_id', 'nic_no']);
            $table->index(['agency_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('candidates');
    }
};
