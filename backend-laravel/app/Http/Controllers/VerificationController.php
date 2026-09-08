<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Models\AppCounter;
use App\Models\EmailVerification;
use App\Services\EmailService;
use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class VerificationController extends Controller
{
    private function newToken(): string
    {
        return bin2hex(random_bytes(24));
    }

    /** GET /verification/emails?status=&search= */
    public function listEmails(Request $request)
    {
        $status = $request->query('status', 'all');
        $search = trim((string) $request->query('search', ''));

        $query = EmailVerification::query();
        if ($status !== 'all') {
            $query->where('status', $status);
        }
        if ($search !== '') {
            $term = '%'.$search.'%';
            $query->where(function ($q) use ($term) {
                $q->where('email', 'like', $term)->orWhere('name', 'like', $term);
            });
        }

        $rows = $query->get()->map(fn (EmailVerification $r) => $r->toPublic())->values();

        return ApiResponse::ok($rows);
    }

    /** POST /verification/emails */
    public function requestEmail(Request $request)
    {
        Validator::make($request->all(), [
            'email' => 'required|email',
        ], ['email.email' => 'A valid email is required.'])->validate();

        $token = $this->newToken();
        $sequence = AppCounter::next('verification');

        $record = EmailVerification::create([
            'id' => 'EV-'.$sequence,
            'email' => $request->input('email'),
            'name' => $request->input('name') ?: '-',
            'agency' => $request->input('agency') ?: '-',
            'status' => 'unverified',
            'requested_at' => now()->format('Y-m-d H:i'),
            'attempts' => 1,
            'token' => $token,
        ]);

        EmailService::sendVerification($record->email, $token);

        return ApiResponse::created($record->toPublic(), 'Verification email sent.');
    }

    /** POST /verification/emails/:id/resend */
    public function resendEmail(string $id)
    {
        $record = EmailVerification::find($id);
        if (! $record) {
            throw new ApiException(404, 'Verification request not found.');
        }
        if ($record->status === 'verified') {
            throw new ApiException(400, 'This email is already verified.');
        }

        $token = $this->newToken();
        $record->token = $token;
        $record->attempts = (int) $record->attempts + 1;
        $record->status = 'unverified';
        $record->requested_at = now()->format('Y-m-d H:i');
        $record->save();

        EmailService::sendVerification($record->email, $token);

        return ApiResponse::ok($record->toPublic(), 'Verification email resent to '.$record->email.'.');
    }

    /** PATCH /verification/emails/:id/verify - manual override by the admin. */
    public function markVerified(Request $request, string $id)
    {
        $record = EmailVerification::find($id);
        if (! $record) {
            throw new ApiException(404, 'Verification request not found.');
        }

        $auth = $request->attributes->get('auth_user');
        $record->status = 'verified';
        $record->verified_at = now()->toIso8601String();
        $record->verified_by = $auth['sub'] ?? null;
        $record->save();

        return ApiResponse::ok($record->toPublic(), $record->email.' marked as verified.');
    }

    /** GET /verification/emails/confirm/:token - public link from the email. */
    public function confirmByToken(string $token)
    {
        $record = EmailVerification::where('token', $token)->first();
        if (! $record) {
            throw new ApiException(400, 'This confirmation link is invalid or has expired.');
        }

        $record->status = 'verified';
        $record->verified_at = now()->toIso8601String();
        $record->save();

        return ApiResponse::ok($record->toPublic(), 'Email confirmed. You can now sign in.');
    }
}
