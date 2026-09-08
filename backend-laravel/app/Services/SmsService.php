<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;

/**
 * OTP delivery over SMS, ported from services/sms.service.js.
 *
 * No provider is wired up yet, so this logs the code and reports
 * delivered=false, which is what makes the UI keep showing the code on screen.
 */
class SmsService
{
    public static function toE164(string $phone): string
    {
        $cc = env('SMS_COUNTRY_CODE') ?: '94';
        $digits = preg_replace('/\D/', '', $phone);

        if (str_starts_with(trim($phone), '+')) {
            return '+'.$digits;
        }
        if (str_starts_with($digits, $cc)) {
            return '+'.$digits;
        }
        if (str_starts_with($digits, '0')) {
            return '+'.$cc.substr($digits, 1);
        }

        return '+'.$cc.$digits;
    }

    public static function isConfigured(): bool
    {
        return (bool) env('SMS_PROVIDER_KEY');
    }

    /** Returns ['delivered' => bool, 'to' => string]. */
    public static function sendOtp(string $phone, string $code): array
    {
        $to = self::toE164($phone);

        if (! self::isConfigured()) {
            Log::info('[sms] OTP for '.$to.': '.$code);
            return ['delivered' => false, 'to' => $to];
        }

        // Plug in Twilio / Dialog / Notify.lk here and return delivered=true.
        throw new \RuntimeException('SMS provider key is set but no provider client is wired up yet.');
    }
}
