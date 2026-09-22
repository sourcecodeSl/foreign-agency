<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Where a candidate's police report has got to.
 *
 * Applied: the reference number is on record and the report is awaited.
 * Received: the reference number and the date it was issued are both on
 * record. A police report is good for six months from that date, so the
 * expiry is worked out from it rather than stored.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('candidates', function (Blueprint $table) {
            $table->enum('police_status', ['not_applied', 'applied', 'received'])
                ->default('not_applied')->after('test_results');
            $table->string('police_reference_no', 60)->nullable()->after('police_status');
            $table->date('police_issued_date')->nullable()->after('police_reference_no');

            $table->index('police_status');
        });
    }

    public function down(): void
    {
        Schema::table('candidates', function (Blueprint $table) {
            $table->dropIndex(['police_status']);
            $table->dropColumn(['police_status', 'police_reference_no', 'police_issued_date']);
        });
    }
};
