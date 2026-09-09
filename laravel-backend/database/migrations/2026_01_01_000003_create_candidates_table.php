<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Candidates (students) are registered by an agency and never log in, so they
 * carry no password and need no OTP verification.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('candidates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('agency_id')->constrained('agencies')->cascadeOnDelete();
            $table->string('name', 150);
            $table->string('passport_no', 30);
            $table->string('nic_no', 20);
            $table->text('address');
            $table->string('mobile', 20);
            $table->string('email', 190)->nullable();
            $table->enum('status', ['draft', 'submitted', 'approved', 'rejected'])->default('draft');
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            // Passport and NIC identify a person nationally, so they must not
            // repeat inside the roster of one agency.
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
