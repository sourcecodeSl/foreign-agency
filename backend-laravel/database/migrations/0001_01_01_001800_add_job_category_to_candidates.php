<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The trade a candidate is registered for, and the number on their test sheet.
 *
 * The job category is the same list the skill tests are booked against, so a
 * candidate registered as a Tiler can be put up for a Tiler test without the
 * trade being typed twice. The test index number is the agency's own
 * reference, kept as written.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('candidates', function (Blueprint $table) {
            $table->unsignedInteger('job_role_id')->nullable()->after('email');
            $table->string('test_index_no', 40)->nullable()->after('job_role_id');

            $table->index('job_role_id');
            $table->index('test_index_no');
        });
    }

    public function down(): void
    {
        Schema::table('candidates', function (Blueprint $table) {
            $table->dropIndex(['job_role_id']);
            $table->dropIndex(['test_index_no']);
            $table->dropColumn(['job_role_id', 'test_index_no']);
        });
    }
};
