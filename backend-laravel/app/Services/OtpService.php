<?php

namespace App\Services;

use App\Models\OtpChallenge;

/**
 * OTP challenge lifecycle, ported from utils/otp.js. The in-memory Map is now
 * the `otp_challenges` table because PHP does not keep state between requests.
 */
class OtpService
{
    public static function ttlSeconds(): int
    {
        return (int) (env('OTP_TTL_SECONDS') ?: 300);
    }

    public static function resendCooldown(): int
    {
        return (int) (env('OTP_RESEND_COOLDOWN') ?: 59);
    }

    /**
     * The code is echoed to the UI only when the provider could not actually
     * deliver it. Unlike the Node version this is not gated on APP_ENV, so a
     * fresh deployment without SMTP/SMS still lets the admin sign in; set
     * SHOW_DEV_OTP=false once real delivery is configured.
     */
    public static function devCode(string $code, array $sent): ?string
    {
        if (! empty($sent['delivered'])) {
            return null;
        }
        $show = filter_var(env('SHOW_DEV_OTP', true), FILTER_VALIDATE_BOOL);

        return $show ? $code : null;
    }

    private static function nowMs(): int
    {
        return (int) round(microtime(true) * 1000);
    }

    private static function generateCode(): string
    {
        return str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    }

    /** Creates a verification challenge for one channel. */
    public static function createChallenge(int $adminId, string $destination, string $channel = 'sms', array $meta = []): array
    {
        $id = 'chg_'.bin2hex(random_bytes(12));
        $code = self::generateCode();
        $now = self::nowMs();
        $expiresAt = $now + self::ttlSeconds() * 1000;

        OtpChallenge::create([
            'id' => $id,
            'admin_id' => $adminId,
            'destination' => $destination,
            'channel' => $channel,
            'meta' => $meta,
            'code' => $code,
            'expires_at' => $expiresAt,
            'last_sent_at' => $now,
            'attempts' => 0,
        ]);

        return ['id' => $id, 'code' => $code, 'channel' => $channel, 'expiresAt' => $expiresAt];
    }

    public static function getChallenge(string $id): ?OtpChallenge
    {
        return OtpChallenge::find($id);
    }

    /** Returns ['ok' => true, 'challenge' => OtpChallenge] or ['ok' => false, 'reason' => ...]. */
    public static function verifyChallenge(string $id, string $code, ?string $expectedChannel = null): array
    {
        $challenge = OtpChallenge::find($id);
        if (! $challenge) {
            return ['ok' => false, 'reason' => 'This verification session has expired.'];
        }

        if ($expectedChannel && $challenge->channel !== $expectedChannel) {
            return ['ok' => false, 'reason' => 'Wrong verification step for this session.'];
        }

        if (self::nowMs() > $challenge->expires_at) {
            $challenge->delete();

            return ['ok' => false, 'reason' => 'The code has expired. Request a new one.'];
        }

        $challenge->attempts = (int) $challenge->attempts + 1;
        $challenge->save();

        if ($challenge->attempts > 5) {
            $challenge->delete();

            return ['ok' => false, 'reason' => 'Too many attempts. Please sign in again.'];
        }
        if ($challenge->code !== $code) {
            return ['ok' => false, 'reason' => 'That code is incorrect.'];
        }

        $data = $challenge->replicate();
        $data->id = $challenge->id;
        $challenge->delete();

        return ['ok' => true, 'challenge' => $data];
    }

    /** Enforces the same 59-second cooldown the UI counts down. */
    public static function rotateCode(string $id): array
    {
        $challenge = OtpChallenge::find($id);
        if (! $challenge) {
            return ['ok' => false, 'reason' => 'This verification session has expired.'];
        }

        $elapsed = (self::nowMs() - $challenge->last_sent_at) / 1000;
        $cooldown = self::resendCooldown();
        if ($elapsed < $cooldown) {
            return [
                'ok' => false,
                'reason' => 'Please wait before requesting another code.',
                'retryAfter' => (int) ceil($cooldown - $elapsed),
            ];
        }

        $challenge->code = self::generateCode();
        $challenge->last_sent_at = self::nowMs();
        $challenge->expires_at = self::nowMs() + self::ttlSeconds() * 1000;
        $challenge->attempts = 0;
        $challenge->save();

        return ['ok' => true, 'code' => $challenge->code, 'channel' => $challenge->channel, 'cooldown' => $cooldown];
    }

    /** Masks a phone for display: 0770000000 -> "077 XXX 0000". */
    public static function maskPhone(string $phone): string
    {
        $digits = preg_replace('/\D/', '', $phone);
        if (strlen($digits) < 6) {
            return '****';
        }
        $middle = str_repeat('X', max(strlen($digits) - 7, 3));

        return substr($digits, 0, 3).' '.$middle.' '.substr($digits, -4);
    }

    /** Masks an email: admin@example.com -> "ad***@example.com". */
    public static function maskEmail(string $email): string
    {
        $parts = explode('@', $email);
        if (count($parts) < 2) {
            return '****';
        }
        [$local, $domain] = $parts;
        $head = substr($local, 0, min(2, strlen($local)));
        $hidden = min(max(strlen($local) - strlen($head), 3), 6);

        return $head.str_repeat('*', $hidden).'@'.$domain;
    }
}
