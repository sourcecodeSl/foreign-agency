<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Agencies come in two kinds: local recruitment agencies in Sri Lanka and
 * foreign companies based overseas. Both are approved, sign in and register
 * candidates the same way; the type says which side of the corridor an agency
 * sits on, and a foreign company records its country.
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

        // Every agency created before this was a Sri Lankan one.
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
