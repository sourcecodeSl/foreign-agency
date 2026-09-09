<?php

namespace App\Services;

use App\Mail\OtpCodeMail;
use App\Models\OtpChallenge;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;

/**
 * Issues and verifies the login codes.
 *
 * Codes are hashed at rest, expire after config('otp.ttl_seconds'), allow a
 * limited number of attempts, and cannot be re-sent inside the cooldown.
 */
class OtpService
{
    public function __construct(private SmsService $sms) {}

    /**
     * Opens a challenge on one channel and delivers the code.
     *
     * @param  array{phone_verified?: bool}  $meta
     * @return array{challenge: OtpChallenge, code: string, delivered: bool}
     */
    public function issue(User $user, string $channel, array $meta = []): array
    {
        $code = $this->generateCode();
        $destination = $channel === 'email' ? $user->email : $user->phone;

        $challenge = OtpChallenge::create([
            'user_id' => $user->id,
            'channel' => $channel,
            'destination' => $destination,
            'code_hash' => Hash::make($code),
            'attempts' => 0,
            'phone_verified' => $meta['phone_verified'] ?? false,
            'last_sent_at' => now(),
            'expires_at' => now()->addSeconds(config('otp.ttl_seconds')),
        ]);

        $delivered = $this->deliver($channel, $destination, $code);

        return ['challenge' => $challenge, 'code' => $code, 'delivered' => $delivered];
    }

    /**
     * Checks a submitted code.
     *
     * @return array{ok: bool, reason?: string, challenge?: OtpChallenge}
     */
    public function verify(string $challengeId, string $code, string $expectedChannel): array
    {
        $challenge = OtpChallenge::find($challengeId);

        if (! $challenge || $challenge->isConsumed()) {
            return ['ok' => false, 'reason' => 'This verification session has expired.'];
        }

        if ($challenge->channel !== $expectedChannel) {
            return ['ok' => false, 'reason' => 'Wrong verification step for this session.'];
        }

        if ($challenge->isExpired()) {
            $challenge->delete();

            return ['ok' => false, 'reason' => 'The code has expired. Request a new one.'];
        }

        $challenge->increment('attempts');

        if ($challenge->attempts > config('otp.max_attempts')) {
            $challenge->delete();

            return ['ok' => false, 'reason' => 'Too many attempts. Please sign in again.'];
        }

        if (! Hash::check($code, $challenge->code_hash)) {
            return ['ok' => false, 'reason' => 'That code is incorrect.'];
        }

        // Single use.
        $challenge->update(['consumed_at' => now()]);

        return ['ok' => true, 'challenge' => $challenge];
    }

    /**
     * Rotates the code on an existing challenge, honouring the cooldown.
     *
     * @return array{ok: bool, reason?: string, retry_after?: int, code?: string, delivered?: bool, challenge?: OtpChallenge}
     */
    public function resend(string $challengeId): array
    {
        $challenge = OtpChallenge::find($challengeId);

        if (! $challenge || $challenge->isConsumed()) {
            return ['ok' => false, 'reason' => 'This verification session has expired.'];
        }

        $remaining = $challenge->cooldownRemaining();
        if ($remaining > 0) {
            return [
                'ok' => false,
                'reason' => 'Please wait before requesting another code.',
                'retry_after' => $remaining,
            ];
        }

        $code = $this->generateCode();
        $challenge->update([
            'code_hash' => Hash::make($code),
            'attempts' => 0,
            'last_sent_at' => now(),
            'expires_at' => now()->addSeconds(config('otp.ttl_seconds')),
        ]);

        $delivered = $this->deliver($challenge->channel, $challenge->destination, $code);

        return ['ok' => true, 'code' => $code, 'delivered' => $delivered, 'challenge' => $challenge];
    }

    /**
     * The code is echoed back to the client only while delivery is not
     * actually working, and never in production.
     */
    public function exposeCode(string $code, bool $delivered): ?string
    {
        if (app()->environment('production') || ! config('otp.expose_code')) {
            return null;
        }

        return $delivered ? null : $code;
    }

    public function maskPhone(?string $phone): string
    {
        $digits = preg_replace('/\D/', '', (string) $phone);
        if (strlen($digits) < 6) {
            return '****';
        }

        $hidden = max(3, min(6, strlen($digits) - 7));

        return substr($digits, 0, 3) . ' ' . str_repeat('X', $hidden) . ' ' . substr($digits, -4);
    }

    public function maskEmail(?string $email): string
    {
        $parts = explode('@', (string) $email);
        if (count($parts) !== 2) {
            return '****';
        }

        [$local, $domain] = $parts;
        $head = substr($local, 0, min(2, strlen($local)));
        $hidden = max(3, min(6, strlen($local) - strlen($head)));

        return $head . str_repeat('*', $hidden) . '@' . $domain;
    }

    private function generateCode(): string
    {
        $length = config('otp.length', 6);

        return str_pad((string) random_int(0, (10 ** $length) - 1), $length, '0', STR_PAD_LEFT);
    }

    /** True when the provider actually accepted the message. */
    private function deliver(string $channel, string $destination, string $code): bool
    {
        if ($channel === 'email') {
            try {
                Mail::to($destination)->send(new OtpCodeMail($code));

                // 'log' writes to storage/logs and 'array' just collects in
                // memory - neither actually reaches the recipient, so the code
                // still has to be surfaced another way.
                return ! in_array(config('mail.default'), ['log', 'array', null], true);
            } catch (\Throwable $e) {
                report($e);

                return false;
            }
        }

        return $this->sms->sendOtp($destination, $code);
    }
}
