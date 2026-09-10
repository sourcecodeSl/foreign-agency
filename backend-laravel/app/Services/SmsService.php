<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * OTP delivery over SMS via the OzoneSender gateway.
 *
 * OzoneSender takes a plain GET request with everything in the query string
 * (user_id, api_key, sender_id, recipient_contact_no, message) and answers with
 * HTTP 204 on success. When the credentials are not configured the code is only
 * logged and delivered=false is returned, which keeps the UI showing the code
 * on screen so a fresh install can still sign in.
 */
class SmsService
{
    /** OzoneSender wants a bare 94XXXXXXXXX number, no plus sign. */
    public static function toE164(string $phone): string
    {
        $cc = env('SMS_COUNTRY_CODE') ?: '94';
        $digits = preg_replace('/\D/', '', $phone);

        if (str_starts_with($digits, $cc)) {
            return $digits;
        }
        if (str_starts_with($digits, '0')) {
            return $cc.substr($digits, 1);
        }

        // A local 9-digit subscriber number such as 7XXXXXXXX.
        return $cc.$digits;
    }

    private static function config(): array
    {
        return config('services.ozonesender');
    }

    public static function isConfigured(): bool
    {
        $cfg = self::config();

        return ! empty($cfg['user_id']) && ! empty($cfg['api_key']) && ! empty($cfg['sender_id']);
    }

    /** Returns ['delivered' => bool, 'to' => string]. */
    public static function sendOtp(string $phone, string $code): array
    {
        $to = self::toE164($phone);
        $message = 'Your Agency Admin verification code is '.$code.'. It expires shortly. Never share it.';

        return self::send($to, $message);
    }

    /**
     * Low-level send. Mirrors the Solidrow SMS class: a GET with query params,
     * treating HTTP 204 (or a status=success body) as delivered.
     *
     * @return array{delivered: bool, to: string}
     */
    public static function send(string $to, string $message): array
    {
        if (! self::isConfigured()) {
            Log::info('[sms] (not configured) OTP to '.$to.': '.$message);

            return ['delivered' => false, 'to' => $to];
        }

        $cfg = self::config();

        try {
            $response = Http::timeout(15)->get($cfg['endpoint'], [
                'user_id' => $cfg['user_id'],
                'api_key' => $cfg['api_key'],
                'sender_id' => $cfg['sender_id'],
                'recipient_contact_no' => $to,
                'message' => $message,
            ]);

            $status = $response->status();
            $body = json_decode($response->body(), true);
            $bodyStatus = is_array($body) ? ($body['status'] ?? null) : null;

            $delivered = $status === 204
                || ($status >= 200 && $status < 300)
                || $bodyStatus === 'success';

            if ($delivered) {
                Log::info('[sms] sent to '.$to.' (HTTP '.$status.')');
            } else {
                Log::warning('[sms] gateway rejected '.$to.' (HTTP '.$status.'): '.$response->body());
            }

            return ['delivered' => $delivered, 'to' => $to];
        } catch (\Throwable $e) {
            Log::error('[sms] failed to '.$to.': '.$e->getMessage());

            return ['delivered' => false, 'to' => $to];
        }
    }
}
