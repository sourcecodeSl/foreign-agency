<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Agencies are local or foreign again.
 *
 * An agency of type foreign is still an agency: it registers its own
 * candidates and signs in like any other. It is not a foreign_companies row -
 * those are the overseas employers that run skill tests and hire. Both read
 * as "foreign company" on screen, so the code names the table it means.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('agencies', 'type')) {
            Schema::table('agencies', function (Blueprint $table) {
                $table->string('type', 10)->default('local')->after('code')->index();
                $table->string('country', 80)->nullable()->after('address');
            });
        }

        DB::table('agencies')->where('type', 'local')->whereNull('country')->update(['country' => 'Sri Lanka']);
    }

    public function down(): void
    {
        if (Schema::hasColumn('agencies', 'type')) {
            Schema::table('agencies', function (Blueprint $table) {
                $table->dropIndex(['type']);
                $table->dropColumn(['type', 'country']);
            });
        }
    }
};
