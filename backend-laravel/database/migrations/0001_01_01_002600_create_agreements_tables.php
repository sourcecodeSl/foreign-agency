<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Agreements: the paper the Main Admin uploads, and the copies filled from it.
 *
 * A template is the uploaded PDF, read with one of the layouts the system
 * knows (App\Support\AgreementLayout) - that layout is what lists the blanks.
 * An agreement is one filled copy: every field held in English, Hebrew and
 * Sinhala, with a note of which values came from the translation service and
 * have not been checked by a person yet.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('agreement_templates', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name', 150);
            $table->string('layout', 60);
            // The PDF itself, on the private disk.
            $table->string('disk', 20);
            $table->string('path', 255);
            $table->string('original_name', 255);
            $table->unsignedInteger('size_bytes')->default(0);
            $table->unsignedInteger('uploaded_by')->nullable();
            $table->timestamps();
        });

        Schema::create('agreements', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('template_id');
            $table->string('title', 150);
            // { field: { en, he, si, auto: { he: bool, si: bool } } }
            $table->json('field_values')->nullable();
            $table->unsignedInteger('created_by')->nullable();
            $table->unsignedInteger('updated_by')->nullable();
            $table->timestamps();

            $table->foreign('template_id')->references('id')->on('agreement_templates')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('agreements');
        Schema::dropIfExists('agreement_templates');
    }
};
