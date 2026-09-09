<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;

/**
 * SMS delivery for login codes.
 *
 * The default 'log' driver writes the code to the Laravel log and reports
 * delivered = false, which is what keeps the code visible to the client while
 * a real gateway is not configured.
 */
class SmsService
{
    /** Returns true only when a provider actually accepted the message. */
    public function sendOtp(string $phone, string $code): bool
    {
        $to = $this->toE164($phone);
        $message = 'Your verification code is ' . $code . '. It expires in '
            . (int) round(config('otp.ttl_seconds') / 60) . ' minutes.';

        return match (config('sms.driver')) {
            'twilio' => $this->sendViaTwilio($to, $message),
            default => $this->logOnly($to, $message),
        };
    }

    /**
     * Normalises a local Sri Lankan number to E.164, which every gateway
     * expects: 0781311850 becomes +94781311850.
     */
    public function toE164(string $phone): string
    {
        $digits = preg_replace('/\D/', '', $phone);
        $cc = (string) config('sms.country_code');

        if (str_starts_with(trim($phone), '+')) {
            return '+' . $digits;
        }
        if (str_starts_with($digits, $cc)) {
            return '+' . $digits;
        }
        if (str_starts_with($digits, '0')) {
            return '+' . $cc . substr($digits, 1);
        }

        return '+' . $cc . $digits;
    }

    private function logOnly(string $to, string $message): bool
    {
        Log::info('[sms] ' . $to . ' :: ' . $message);

        return false;
    }

    private function sendViaTwilio(string $to, string $message): bool
    {
        // Install twilio/sdk, then:
        // (new \Twilio\Rest\Client(config('sms.twilio.sid'), config('sms.twilio.token')))
        //     ->messages->create($to, ['from' => config('sms.from'), 'body' => $message]);
        Log::warning('[sms] twilio driver selected but no client is wired up.');

        return false;
    }
}
