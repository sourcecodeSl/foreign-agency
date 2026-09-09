<?php

namespace App\Enums;

/** Lifecycle of an agency account and of an agency login. */
enum AccountStatus: string
{
    case Pending = 'pending';
    case Active = 'active';
    case Deactivated = 'deactivated';

    /** @return array<int, string> */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
