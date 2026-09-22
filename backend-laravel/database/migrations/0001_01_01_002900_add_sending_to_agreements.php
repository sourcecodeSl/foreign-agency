<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Where a foreign company's agreement has got to.
 *
 *   draft           the company is still checking it; only it sees it.
 *   sent_to_admin   the company sent it; the Main Admin and coordinators see
 *                   it, and the company can no longer change it.
 *   sent_to_agency  the admin side passed it to one local agency, which is
 *                   the first time that agency sees it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('agreements', function (Blueprint $table) {
            $table->string('status', 20)->default('draft')->after('agency_id')->index();
            $table->dateTime('sent_to_admin_at')->nullable()->after('status');
            $table->string('local_agency_id', 20)->nullable()->after('sent_to_admin_at')->index();
            $table->dateTime('sent_to_agency_at')->nullable()->after('local_agency_id');
            $table->unsignedInteger('sent_to_agency_by')->nullable()->after('sent_to_agency_at');
        });
    }

    public function down(): void
    {
        Schema::table('agreements', function (Blueprint $table) {
            $table->dropIndex(['status']);
            $table->dropIndex(['local_agency_id']);
            $table->dropColumn(['status', 'sent_to_admin_at', 'local_agency_id', 'sent_to_agency_at', 'sent_to_agency_by']);
        });
    }
};
