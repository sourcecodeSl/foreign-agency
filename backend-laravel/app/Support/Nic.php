<?php

namespace App\Support;

/**
 * Sri Lankan NIC numbers, which identify a candidate across agencies.
 *
 * The same person may hold the old format (9 digits and V or X) or the new
 * one (12 digits), so both reduce to one key: 901234567V becomes
 * 199012304567 - the two-digit year gains its century and the three-digit
 * serial a leading 0, which is how the new numbers were issued.
 */
final class Nic
{
    public const PATTERN = '/^([0-9]{9}[VvXx]|[0-9]{12})$/';

    /** The 12-digit key for a NIC in either format; null when there is none. */
    public static function key(?string $nic): ?string
    {
        $nic = strtoupper(preg_replace('/\s+/', '', (string) $nic));

        if ($nic === '') {
            return null;
        }

        if (preg_match('/^(\d{2})(\d{3})(\d{3})(\d)[VX]$/', $nic, $m)) {
            return '19'.$m[1].$m[2].'0'.$m[3].$m[4];
        }

        return $nic;
    }
}
