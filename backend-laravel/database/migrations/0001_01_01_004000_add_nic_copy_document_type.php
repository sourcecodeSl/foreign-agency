<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Room for the NIC copy, and any document type after it.
 *
 * The type was a database enum of the eight required documents, so a new
 * type meant changing the column. It is a plain string now: App\Support\
 * DocumentType is the one list, and the upload validation holds to it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('candidate_documents', function (Blueprint $table) {
            $table->string('type', 40)->change();
        });
    }

    public function down(): void
    {
        Schema::table('candidate_documents', function (Blueprint $table) {
            $table->enum('type', [
                'passport_copy',
                'online_police_report',
                'medical',
                'affidavit_english',
                'affidavit_sinhala',
                'family_affidavit_english',
                'family_affidavit_sinhala',
                'agreement',
            ])->change();
        });
    }
};
