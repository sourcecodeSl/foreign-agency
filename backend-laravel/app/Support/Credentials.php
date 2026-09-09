<?php

namespace App\Support;

/** Password / agency-code helpers ported from utils/credentials.js. */
class Credentials
{
    private const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

    private const LOWER = 'abcdefghijkmnopqrstuvwxyz';

    private const DIGIT = '23456789';

    private const SYMBOL = '!@#$%*?';

    private static function pick(string $chars): string
    {
        return $chars[random_int(0, strlen($chars) - 1)];
    }

    /**
     * Cryptographically random password that always satisfies the create-agency
     * rules (>= 8 chars, one uppercase, one digit).
     */
    public static function generatePassword(int $length = 12): string
    {
        $all = self::UPPER.self::LOWER.self::DIGIT.self::SYMBOL;
        $out = [self::pick(self::UPPER), self::pick(self::LOWER), self::pick(self::DIGIT), self::pick(self::SYMBOL)];
        while (count($out) < $length) {
            $out[] = self::pick($all);
        }

        // Fisher-Yates so the guaranteed characters are not always in front.
        for ($i = count($out) - 1; $i > 0; $i--) {
            $j = random_int(0, $i);
            [$out[$i], $out[$j]] = [$out[$j], $out[$i]];
        }

        return implode('', $out);
    }

    /** Short human-readable agency code, e.g. "SKY-1042". */
    public static function generateAgencyCode(string $name, int|string $sequence): string
    {
        $letters = strtoupper(preg_replace('/[^a-zA-Z]/', '', $name));
        $prefix = str_pad(substr($letters, 0, 3), 3, 'X');

        return $prefix.'-'.$sequence;
    }

    public static function slugify(string $value): string
    {
        $slug = strtolower(trim($value));
        $slug = preg_replace('/[^a-z0-9]+/', '_', $slug);

        return trim($slug, '_');
    }
}
