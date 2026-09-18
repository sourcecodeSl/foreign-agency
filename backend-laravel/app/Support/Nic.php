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

    /**
     * The date of birth written into a NIC, as Y-m-d; null when it cannot be read.
     *
     * The key starts with the four-digit year and a three-digit day of the
     * year, plus 500 for a woman. The day is counted as if February always had
     * 29 days, so day 60 is 29 February and a normal year skips it.
     */
    public static function birthDate(?string $nic): ?string
    {
        $key = self::key($nic);
        if ($key === null || ! preg_match('/^(\d{4})(\d{3})\d{5}$/', $key, $m)) {
            return null;
        }

        $year = (int) $m[1];
        $day = (int) $m[2];
        if ($day > 500) {
            $day -= 500;
        }

        if ($day < 1 || $day > 366) {
            return null;
        }

        // Walk the months of a leap year, then check the date exists this year.
        $month = 1;
        foreach ([31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as $length) {
            if ($day <= $length) {
                break;
            }
            $day -= $length;
            $month++;
        }

        return checkdate($month, $day, $year) ? sprintf('%04d-%02d-%02d', $year, $month, $day) : null;
    }
}
