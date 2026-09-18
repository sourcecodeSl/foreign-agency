<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Foreign companies, the job roles they test for, and the skill tests
 * themselves.
 *
 * A foreign company belongs to the coordinator (foreign agent) who brought it
 * in. A candidate stays in the pool until they pass a test, and passing locks
 * them to that one company - which is why the lock lives on the candidate.
 *
 * Agencies are left as they are. An earlier version of this migration moved
 * "foreign" agencies into foreign_companies, deleted them and dropped
 * agencies.type/country; 0001_01_01_001700 put the columns back because a
 * foreign agency is still an agency. On a database that has not run this yet
 * (the live site) that step would only lose agencies and their logins, so it
 * is gone.
 */
return new class extends Migration
{
    private const JOB_ROLES = [
        'Tiler',
        'Shuttering Carpenter',
        'Mason',
        'Steel Fixer',
        'Welder',
        'Electrician',
        'Plumber',
        'Painter',
        'Heavy Vehicle Driver',
        'Caregiver',
        'Agriculture Worker',
        'General Labourer',
    ];

    public function up(): void
    {
        $now = now()->format('Y-m-d H:i:s');

        Schema::create('foreign_companies', function (Blueprint $table) {
            $table->increments('id');
            $table->string('code', 20)->unique();            // FC-1001
            $table->string('name', 150);
            $table->string('country', 80);
            $table->string('city', 80)->nullable();
            $table->string('contact_name', 120)->nullable();
            $table->string('contact_email', 190)->nullable();
            $table->string('contact_phone', 20)->nullable();
            // The coordinator (foreign agent) who manages this company.
            $table->unsignedInteger('coordinator_id')->nullable();
            $table->enum('status', ['active', 'inactive'])->default('active');
            $table->string('notes', 255)->nullable();
            $table->timestamps();

            $table->index(['coordinator_id', 'status']);
        });

        Schema::create('job_roles', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name', 120);
            $table->string('slug', 120)->unique();
            $table->boolean('active')->default(true);
            $table->timestamps();
        });

        DB::table('job_roles')->insertOrIgnore(array_map(fn (string $name) => [
            'name' => $name,
            'slug' => str_replace(' ', '_', strtolower($name)),
            'active' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ], self::JOB_ROLES));

        DB::table('app_counters')->insertOrIgnore([
            ['name' => 'company', 'value' => 1000],
            ['name' => 'test', 'value' => 1000],
        ]);

        Schema::create('skill_tests', function (Blueprint $table) {
            $table->increments('id');
            $table->string('test_no', 20)->unique();         // TST-1001
            $table->unsignedInteger('candidate_id');
            $table->string('agency_id', 20);                 // the agency that owns the candidate
            $table->unsignedInteger('company_id');
            $table->unsignedInteger('job_role_id');
            $table->date('scheduled_for');
            // scheduled -> passed / failed, or closed when a new attempt replaces it.
            $table->enum('status', ['scheduled', 'passed', 'failed', 'closed'])->default('scheduled');
            $table->string('result_note', 255)->nullable();
            $table->dateTime('decided_at')->nullable();
            $table->unsignedInteger('decided_by')->nullable();
            $table->unsignedInteger('created_by')->nullable();
            $table->timestamps();

            $table->foreign('candidate_id')->references('id')->on('candidates')->cascadeOnDelete();
            $table->foreign('company_id')->references('id')->on('foreign_companies')->cascadeOnDelete();
            $table->foreign('job_role_id')->references('id')->on('job_roles');

            $table->index(['candidate_id', 'status']);
            $table->index(['company_id', 'status']);
            $table->index(['agency_id', 'status']);
        });

        Schema::table('candidates', function (Blueprint $table) {
            // pool -> testing (an attempt is open) -> passed (locked to one company)
            $table->enum('pool_status', ['pool', 'testing', 'passed'])->default('pool')->after('status');
            $table->unsignedInteger('locked_company_id')->nullable()->after('pool_status');
            $table->dateTime('locked_at')->nullable()->after('locked_company_id');

            $table->index('pool_status');
            $table->index('locked_company_id');
        });
    }

    public function down(): void
    {
        Schema::table('candidates', function (Blueprint $table) {
            $table->dropIndex(['pool_status']);
            $table->dropIndex(['locked_company_id']);
            $table->dropColumn(['pool_status', 'locked_company_id', 'locked_at']);
        });

        Schema::dropIfExists('skill_tests');
        Schema::dropIfExists('job_roles');
        Schema::dropIfExists('foreign_companies');

        if (! Schema::hasColumn('agencies', 'type')) {
            Schema::table('agencies', function (Blueprint $table) {
                $table->string('type', 10)->default('local')->after('code')->index();
                $table->string('country', 80)->nullable()->after('address');
            });
        }
    }
};
