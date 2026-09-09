<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class OtpCodeMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public string $code) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: $this->code . ' is your verification code',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'mail.otp-code',
            with: [
                'code' => $this->code,
                'minutes' => (int) round(config('otp.ttl_seconds') / 60),
            ],
        );
    }
}
