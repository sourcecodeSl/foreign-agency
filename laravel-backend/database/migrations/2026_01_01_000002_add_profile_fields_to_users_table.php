<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Turns the default users table into the login table for both roles.
 * An agency login carries agency_id; a Main Admin login does not.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('username', 60)->nullable()->unique()->after('name');
            $table->string('phone', 20)->nullable()->unique()->after('email');
            $table->enum('role', ['main_admin', 'agency'])->default('agency')->after('password');
            $table->foreignId('agency_id')->nullable()->after('role')
                ->constrained('agencies')->cascadeOnDelete();
            $table->enum('status', ['pending', 'active', 'deactivated'])->default('active')->after('agency_id');
            $table->timestamp('phone_verified_at')->nullable()->after('status');
            $table->timestamp('last_login_at')->nullable()->after('phone_verified_at');
            // Credentials issued by an admin should be rotated on first use.
            $table->boolean('must_change_password')->default(false)->after('last_login_at');

            $table->index(['role', 'status']);
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['agency_id']);
            $table->dropIndex(['role', 'status']);
            $table->dropColumn([
                'username', 'phone', 'role', 'agency_id', 'status',
                'phone_verified_at', 'last_login_at', 'must_change_password',
            ]);
        });
    }
};
