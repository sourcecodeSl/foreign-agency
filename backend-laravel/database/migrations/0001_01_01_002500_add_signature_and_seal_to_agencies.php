<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The signature and the seal an agency puts on its paperwork.
 *
 * Both are pictures, kept on the same private disk as candidate documents -
 * only the path is held here, so nothing is reachable from the web. They are
 * added on the edit screen, never when the record is first created.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('agencies', function (Blueprint $table) {
            $table->string('signature_path', 255)->nullable()->after('lawyer_position');
            $table->dateTime('signature_uploaded_at')->nullable()->after('signature_path');
            $table->string('seal_path', 255)->nullable()->after('signature_uploaded_at');
            $table->dateTime('seal_uploaded_at')->nullable()->after('seal_path');
        });
    }

    public function down(): void
    {
        Schema::table('agencies', function (Blueprint $table) {
            $table->dropColumn([
                'signature_path', 'signature_uploaded_at', 'seal_path', 'seal_uploaded_at',
            ]);
        });
    }
};
