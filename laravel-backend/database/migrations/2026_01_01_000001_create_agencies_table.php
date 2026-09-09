<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('agencies', function (Blueprint $table) {
            $table->id();
            $table->string('code', 20)->unique();     // e.g. SKY-1042
            $table->string('name', 150);
            $table->text('address');
            $table->string('contact_person', 120)->nullable();
            $table->string('email', 190)->nullable();
            $table->string('phone', 20)->nullable();
            $table->enum('status', ['pending', 'active', 'deactivated'])->default('pending');
            // Which Main Admin created it.
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('agencies');
    }
};
