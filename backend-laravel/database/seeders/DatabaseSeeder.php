<?php

namespace Database\Seeders;

use App\Models\Agency;
use App\Models\AppCounter;
use App\Models\EmailVerification;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->seedRoles();
        $this->seedCounters();
        $this->seedAgencies();
        $this->seedVerifications();
        $this->seedAdmin();
    }

    /** Roles + permission matrices, ported from models/role.store.js. */
    private function seedRoles(): void
    {
        $grid = fn ($v, $c, $e, $d) => ['view' => $v, 'create' => $c, 'edit' => $e, 'delete' => $d];
        $modules = Role::MODULES;

        $full = [];
        foreach ($modules as $m) {
            $full[$m] = $grid(true, true, true, true);
        }

        // Agents do the day-to-day registration and document uploads.
        $agent = Role::emptyMatrix();
        $agent['candidates'] = $grid(true, true, true, false);

        $auditor = [];
        foreach ($modules as $m) {
            $auditor[$m] = $grid($m !== 'settings', false, false, false);
        }

        $roles = [
            ['id' => 'RL-01', 'name' => 'Main Admin', 'slug' => 'main_admin', 'is_system' => true,
                'description' => 'Full system control including agency creation and permissions.',
                'permissions' => $full],
            ['id' => 'RL-02', 'name' => 'Agency Owner', 'slug' => 'agency_owner', 'is_system' => false,
                'description' => 'Manages a single agency, its staff and its data.',
                // An agency signs in to register candidates and nothing else.
                // Documents are never removed, so there is no delete grant.
                'permissions' => array_merge(Role::emptyMatrix(), [
                    'candidates' => $grid(true, true, true, false),
                ])],
            ['id' => 'RL-03', 'name' => 'Agency Manager', 'slug' => 'agency_manager', 'is_system' => false,
                'description' => 'Day-to-day operations inside an agency, no billing access.',
                'permissions' => array_merge(Role::emptyMatrix(), [
                    'candidates' => $grid(true, true, true, false),
                ])],
            ['id' => 'RL-04', 'name' => 'Agent', 'slug' => 'agent', 'is_system' => false,
                'description' => 'Handles assigned records only.',
                'permissions' => $agent],
            ['id' => 'RL-05', 'name' => 'Auditor', 'slug' => 'auditor', 'is_system' => false,
                'description' => 'Read-only access across all agencies for compliance review.',
                'permissions' => $auditor],
        ];

        foreach ($roles as $role) {
            Role::updateOrCreate(['id' => $role['id']], $role);
        }
    }

    private function seedCounters(): void
    {
        foreach (['agency' => 1047, 'role' => 5, 'verification' => 504] as $name => $value) {
            AppCounter::updateOrCreate(['name' => $name], ['value' => $value]);
        }
    }

    /** Demo agencies matching models/agency.store.js. */
    private function seedAgencies(): void
    {
        $rows = [
            ['id' => 'AG-1041', 'name' => 'Skyline Marketing', 'code' => 'SKY-1041', 'address' => '221B Baker Street, Colombo 03', 'username' => 'skyline.admin', 'contact' => 'Nadia Perera', 'email' => 'ops@skyline.lk', 'users' => 14, 'status' => 'active', 'created_at' => '2026-08-12'],
            ['id' => 'AG-1042', 'name' => 'BlueWave Media', 'code' => 'BLW-1042', 'address' => '17 Marine Drive, Galle', 'username' => 'bluewave.admin', 'contact' => 'Rehan Silva', 'email' => 'hello@bluewave.lk', 'users' => 8, 'status' => 'pending', 'created_at' => '2026-09-01'],
            ['id' => 'AG-1043', 'name' => 'Northstar Travels', 'code' => 'NST-1043', 'address' => '5 Hill Street, Kandy', 'username' => 'northstar.admin', 'contact' => 'Ayesha Fernando', 'email' => 'desk@northstar.lk', 'users' => 22, 'status' => 'active', 'created_at' => '2026-07-28'],
            ['id' => 'AG-1044', 'name' => 'Orchid Recruiters', 'code' => 'ORC-1044', 'address' => '90 Union Place, Colombo 02', 'username' => 'orchid.admin', 'contact' => 'Dilan Jayasuriya', 'email' => 'info@orchid.lk', 'users' => 3, 'status' => 'deactivated', 'created_at' => '2026-05-19'],
        ];

        foreach ($rows as $row) {
            Agency::updateOrCreate(['id' => $row['id']], $row);
        }
    }

    /** Demo email-verification requests matching models/verification.store.js. */
    private function seedVerifications(): void
    {
        $rows = [
            ['id' => 'EV-501', 'name' => 'Rehan Silva', 'email' => 'hello@bluewave.lk', 'agency' => 'BlueWave Media', 'status' => 'unverified', 'requested_at' => '2026-09-01 10:22', 'attempts' => 2, 'token' => 'seed-501'],
            ['id' => 'EV-502', 'name' => 'Nadia Perera', 'email' => 'ops@skyline.lk', 'agency' => 'Skyline Marketing', 'status' => 'verified', 'requested_at' => '2026-08-12 09:04', 'attempts' => 1, 'token' => 'seed-502'],
            ['id' => 'EV-503', 'name' => 'Saman Weerasinghe', 'email' => 'admin@lotus.lk', 'agency' => 'Lotus Consulting', 'status' => 'unverified', 'requested_at' => '2026-09-05 15:41', 'attempts' => 1, 'token' => 'seed-503'],
            ['id' => 'EV-504', 'name' => 'Meera Anand', 'email' => 'book@coral.lk', 'agency' => 'Coral Tours', 'status' => 'bounced', 'requested_at' => '2026-04-22 12:10', 'attempts' => 4, 'token' => 'seed-504'],
        ];

        foreach ($rows as $row) {
            EmailVerification::updateOrCreate(['id' => $row['id']], $row);
        }
    }

    /** Seeded Main Admin - change the password after signing in. */
    private function seedAdmin(): void
    {
        $email = strtolower(trim((string) (env('SEED_ADMIN_EMAIL') ?: 'visaltheekshana555@gmail.com')));

        User::updateOrCreate(
            ['email' => $email],
            [
                'name' => env('SEED_ADMIN_NAME') ?: 'Main Admin',
                'username' => env('SEED_ADMIN_USERNAME') ?: 'mainadmin',
                'phone' => env('SEED_ADMIN_PHONE') ?: '0781311850',
                'password_hash' => password_hash(env('SEED_ADMIN_PASSWORD') ?: 'Admin@1234', PASSWORD_BCRYPT),
                'role_slug' => 'main_admin',
                'status' => 'active',
                'email_verified_at' => now(),
                'phone_verified_at' => now(),
            ]
        );
    }
}
