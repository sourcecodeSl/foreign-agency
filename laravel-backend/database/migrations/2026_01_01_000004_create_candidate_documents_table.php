<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('candidate_documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('candidate_id')->constrained('candidates')->cascadeOnDelete();
            $table->enum('type', [
                'passport_copy',
                'online_police_report',
                'medical',
                'affidavit_english',
                'affidavit_sinhala',
                'family_affidavit_english',
                'family_affidavit_sinhala',
                'agreement',
            ]);
            $table->string('disk', 30)->default('local');
            $table->string('path', 255);              // storage path, not a public URL
            $table->string('original_name', 255);
            $table->string('mime_type', 120);
            $table->unsignedBigInteger('size_bytes');
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            // One current file per document type; re-uploading replaces it.
            $table->unique(['candidate_id', 'type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('candidate_documents');
    }
};
