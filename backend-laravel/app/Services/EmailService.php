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
        // The log and array mailers accept a message without sending it
        // anywhere, so they must not count as delivery.
        if (in_array(env('MAIL_MAILER'), ['log', 'array'], true)) {
            return false;
        }

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

    /** Text typed into a form, made safe to place inside the HTML body. */
    private static function e($value): string
    {
        return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
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

    /**
     * A verification code: the second sign-in factor, or confirming a new
     * address. $purpose finishes the sentence "Enter this code to ...".
     */
    public static function sendOtp(string $email, string $code, string $purpose = 'finish signing in'): array
    {
        $ttl = self::otpTtlMinutes();
        $html = self::layout(
            'Your verification code',
            '<p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.6">'
                .'Enter this code to '.$purpose.'. It expires in '.$ttl.' minutes.</p>'
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

    /**
     * Sign-in details for a newly created agency, sent to the address it was
     * registered with.
     *
     * @param  array{agency: string, code: string, contact: string, username: string, password: string, loginUrl: string}  $details
     */
    public static function sendAgencyCredentials(string $email, array $details): array
    {
        $rows = '';
        foreach ([
            'Agency' => $details['agency'],
            'Agency code' => $details['code'],
            'Login URL' => $details['loginUrl'],
            'Username' => $details['username'],
            'Password' => $details['password'],
        ] as $label => $value) {
            $rows .= '<tr>'
                .'<td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;white-space:nowrap">'.$label.'</td>'
                .'<td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;color:#111827;font-size:14px;'
                .'font-family:Consolas,Menlo,monospace;word-break:break-all">'.self::e($value).'</td>'
                .'</tr>';
        }

        $html = self::layout(
            'Your agency account is ready',
            '<p style="margin:0 0 12px;color:#4b5563;font-size:14px;line-height:1.6">'
                .'Hello '.self::e($details['contact']).',</p>'
                .'<p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.6">'
                .'An account has been created for <strong>'.self::e($details['agency']).'</strong>. '
                .'These are the details you sign in with.</p>'
                .'<table role="presentation" cellspacing="0" cellpadding="0" '
                .'style="width:100%;border:1px solid #e5e7eb;border-radius:8px;border-collapse:separate;margin:0 0 20px">'
                .$rows.'</table>'
                .'<p style="margin:0 0 12px;padding:12px 14px;background:#fffbeb;border:1px solid #fde68a;'
                .'border-radius:8px;color:#92400e;font-size:13px;line-height:1.5">'
                .'Your agency is awaiting approval. You can sign in once the administrator has approved it.</p>'
                .'<p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5">'
                .'Signing in sends a code to your phone and then to this email. Keep this password private '
                .'- you can set a new one at any time with "Forgot password?" on the sign-in page.</p>'
        );

        // The log line deliberately leaves the password out.
        return self::deliver(
            $email,
            'Your Agency Admin account is ready',
            $html,
            '[mail] Agency credentials for '.$email.' (username '.$details['username'].') not sent - mail is not configured'
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
