<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Documents are an append-only history.
 *
 * The unique key on (candidate_id, type) allowed only one file per type and
 * made a re-upload overwrite the previous one. Uploading the same type three
 * times must keep all three, so the unique key becomes a plain index and the
 * newest row per type is the current one.
 */
return new class extends Migration
{
    public function up(): void
    {
        // The replacement index has to exist first: MySQL will not drop the
        // unique key while it is the only index backing the candidate_id
        // foreign key. This one also starts with candidate_id, so it takes over.
        Schema::table('candidate_documents', function (Blueprint $table) {
            $table->index(['candidate_id', 'type', 'id'], 'candidate_documents_latest_index');
        });

        Schema::table('candidate_documents', function (Blueprint $table) {
            $table->dropUnique('candidate_documents_candidate_id_type_unique');
        });
    }

    public function down(): void
    {
        Schema::table('candidate_documents', function (Blueprint $table) {
            $table->dropIndex('candidate_documents_latest_index');
            $table->unique(['candidate_id', 'type'], 'candidate_documents_candidate_id_type_unique');
        });
    }
};
