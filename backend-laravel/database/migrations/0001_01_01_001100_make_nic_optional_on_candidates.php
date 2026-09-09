<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The agency registration form collects passport number, name, address,
 * mobile and email. NIC is still stored when supplied, but is no longer
 * required. The unique key stays: MySQL allows repeated NULLs in one.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('candidates', function (Blueprint $table) {
            $table->string('nic_no', 20)->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('candidates', function (Blueprint $table) {
            $table->string('nic_no', 20)->nullable(false)->change();
        });
    }
};
