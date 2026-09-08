<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Transactional email, ported from services/email.service.js.
 *
 * When SMTP credentials are present the mail is really sent; otherwise the
 * message is logged and delivered=false is returned - the auth controller uses
 * that to decide whether the OTP still needs to be shown on screen.
 */
class EmailService
{
    public static function isConfigured(): bool
    {
        return (bool) (env('MAIL_USERNAME') && env('MAIL_PASSWORD'))
            || env('MAIL_MAILER') === 'sendmail';
    }

    private static function otpTtlMinutes(): int
    {
        return (int) round(((int) (env('OTP_TTL_SECONDS') ?: 300)) / 60);
    }

    private static function confirmUrl(string $token): string
    {
        $base = rtrim((string) (env('APP_URL') ?: 'http://localhost'), '/');

        return $base.'/api/v1/verification/emails/confirm/'.$token;
    }

    /** Shared shell so every message looks the same in the inbox. */
    private static function layout(string $heading, string $bodyHtml): string
    {
        return '<div style="margin:0;padding:24px;background:#f3f4f6;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif">'
            .'<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">'
            .'<div style="padding:20px 28px;background:#1d41f5;color:#ffffff">'
            .'<span style="font-size:16px;font-weight:700;letter-spacing:.2px">Agency Admin</span>'
            .'<span style="font-size:12px;opacity:.85;display:block;margin-top:2px">Main Admin System</span>'
            .'</div>'
            .'<div style="padding:28px">'
            .'<h1 style="margin:0 0 12px;font-size:18px;color:#111827">'.$heading.'</h1>'
            .$bodyHtml
            .'</div>'
            .'<div style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px">'
            .'If you did not request this, you can safely ignore this email.'
            .'</div></div></div>';
    }

    /** Sends a message, or logs it when SMTP is not configured. */
    private static function deliver(string $to, string $subject, string $html, string $logLine): array
    {
        if (! self::isConfigured()) {
            Log::info($logLine);
            return ['delivered' => false, 'to' => $to];
        }

        try {
            Mail::html($html, function ($message) use ($to, $subject) {
                $message->to($to)->subject($subject);
            });
            Log::info('[mail] sent to '.$to);
            return ['delivered' => true, 'to' => $to];
        } catch (\Throwable $e) {
            Log::error('[mail] failed to '.$to.': '.$e->getMessage());
            return ['delivered' => false, 'to' => $to];
        }
    }

    /** Second-factor code sent by email (step 2 of sign-in). */
    public static function sendOtp(string $email, string $code): array
    {
        $ttl = self::otpTtlMinutes();
        $html = self::layout(
            'Your verification code',
            '<p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.6">'
                .'Enter this code to finish signing in. It expires in '.$ttl.' minutes.</p>'
                .'<div style="text-align:center;margin:0 0 20px">'
                .'<span style="display:inline-block;padding:14px 28px;background:#eef4ff;border:1px solid #bcd3ff;'
                .'border-radius:10px;font-family:Consolas,Menlo,monospace;font-size:30px;font-weight:700;'
                .'letter-spacing:10px;color:#162fe1">'.$code.'</span></div>'
                .'<p style="margin:0;color:#6b7280;font-size:13px">Never share this code with anyone.</p>'
        );

        return self::deliver(
            $email,
            $code.' is your Agency Admin verification code',
            $html,
            '[mail] OTP for '.$email.': '.$code
        );
    }

    /** Confirmation link used by the Email Verification module. */
    public static function sendVerification(string $email, string $token): array
    {
        $link = self::confirmUrl($token);
        $html = self::layout(
            'Confirm your email address',
            '<p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.6">'
                .'Click the button below to confirm this address.</p>'
                .'<div style="text-align:center;margin:0 0 20px">'
                .'<a href="'.$link.'" style="display:inline-block;padding:12px 24px;background:#1d41f5;'
                .'color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">'
                .'Confirm email</a></div>'
                .'<p style="margin:0;color:#6b7280;font-size:12px;word-break:break-all">'.$link.'</p>'
        );

        return self::deliver(
            $email,
            'Confirm your email address',
            $html,
            '[mail] Verification link for '.$email.': '.$link
        );
    }
}
