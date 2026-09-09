<?php

namespace App\Enums;

/**
 * Login roles. RBAC keys off this: Main Admin manages agencies, an Agency
 * manages only its own candidates.
 */
enum UserRole: string
{
    case MainAdmin = 'main_admin';
    case Agency = 'agency';

    public function label(): string
    {
        return match ($this) {
            self::MainAdmin => 'Main Admin',
            self::Agency => 'Agency',
        };
    }

    /** @return array<int, string> */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
