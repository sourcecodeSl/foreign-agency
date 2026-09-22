<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A foreign company's saved agreement: the PDF it uses every time, kept
 * uploaded so a new agreement can be started from it without uploading it
 * again.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('agreement_templates', function (Blueprint $table) {
            $table->boolean('saved')->default(false)->after('size_bytes');
        });
    }

    public function down(): void
    {
        Schema::table('agreement_templates', function (Blueprint $table) {
            $table->dropColumn('saved');
        });
    }
};
