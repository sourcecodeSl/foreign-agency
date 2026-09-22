<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The employer part of the employment agreement, submitted by a foreign
 * company from its own login - not filled by the Main Admin or a coordinator.
 *
 * The English is read from the company's own record when it submits; only
 * the Hebrew and Sinhala of the words that are translated are its to change.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employer_agreements', function (Blueprint $table) {
            $table->increments('id');
            $table->string('agency_id', 20)->index();
            // { field: { en, he, si, auto: { he: bool, si: bool } } }
            $table->json('field_values');
            $table->unsignedInteger('submitted_by')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employer_agreements');
    }
};
