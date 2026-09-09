<?php

namespace App\Support;

use Firebase\JWT\JWT as FirebaseJwt;
use Firebase\JWT\Key;

/**
 * Stateless HS256 tokens, matching the payload the Express backend issued
 * (sub, name, email, role, roleSlug) so the React client is unchanged.
 */
class Jwt
{
    protected static function secret(): string
    {
        $secret = (string) env('JWT_SECRET', '');

        // HS256 refuses keys shorter than 256 bits, so a short or missing
        // JWT_SECRET is widened deterministically from the app key rather
        // than failing every sign-in with "Provided key is too short".
        if (strlen($secret) >= 32) {
            return $secret;
        }

        return hash('sha256', $secret.'|'.config('app.key'), true);
    }

    /** Parses values like "8h", "300s", "7d", or a plain number of seconds. */
    protected static function ttlSeconds(): int
    {
        $raw = trim((string) (env('JWT_EXPIRES_IN') ?: '8h'));
        if (preg_match('/^(\d+)\s*([smhd])?$/i', $raw, $m)) {
            $n = (int) $m[1];

            return match (strtolower($m[2] ?? 's')) {
                'm' => $n * 60,
                'h' => $n * 3600,
                'd' => $n * 86400,
                default => $n,
            };
        }

        return 8 * 3600;
    }

    public static function sign(array $user): string
    {
        $now = time();
        $payload = [
            'sub' => $user['id'],
            'name' => $user['name'],
            'email' => $user['email'],
            'role' => $user['role'],
            'roleSlug' => $user['roleSlug'],
            // Candidate queries are scoped by this, so agency staff never
            // reach another agency's records.
            'agencyId' => $user['agencyId'] ?? null,
            'iat' => $now,
            'exp' => $now + self::ttlSeconds(),
        ];

        return FirebaseJwt::encode($payload, self::secret(), 'HS256');
    }

    /** Returns the decoded payload as an array, or null when invalid/expired. */
    public static function verify(string $token): ?array
    {
        try {
            $decoded = FirebaseJwt::decode($token, new Key(self::secret(), 'HS256'));

            return (array) $decoded;
        } catch (\Throwable $e) {
            return null;
        }
    }
}
