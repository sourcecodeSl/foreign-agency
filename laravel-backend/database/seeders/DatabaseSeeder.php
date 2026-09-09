<?php

namespace Database\Seeders;

use App\Enums\AccountStatus;
use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Creates the Main Admin. Safe to re-run: an existing account is left
     * alone rather than being overwritten.
     */
    public function run(): void
    {
        $email = mb_strtolower((string) env('SEED_ADMIN_EMAIL', 'admin@example.com'));

        $admin = User::firstOrCreate(
            ['email' => $email],
            [
                'name' => env('SEED_ADMIN_NAME', 'Main Admin'),
                'username' => 'main.admin',
                'phone' => env('SEED_ADMIN_PHONE', '0781311850'),
                'password' => env('SEED_ADMIN_PASSWORD', 'Admin@1234'),
                'role' => UserRole::MainAdmin,
                'status' => AccountStatus::Active,
                'email_verified_at' => now(),
            ]
        );

        $this->command->info($admin->wasRecentlyCreated
            ? 'Seeded Main Admin: ' . $admin->email
            : 'Main Admin already exists: ' . $admin->email);
    }
}
