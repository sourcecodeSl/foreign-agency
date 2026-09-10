<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Models\Agency;
use App\Models\AppCounter;
use App\Models\EmailVerification;
use App\Models\User;
use App\Services\EmailService;
use App\Support\ApiResponse;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class VerificationController extends Controller
{
    /** Roles that look across every agency. */
    private const GLOBAL_ROLES = ['main_admin', 'auditor'];

    private function newToken(): string
    {
        return bin2hex(random_bytes(24));
    }

    private function iso($value): ?string
    {
        return $value ? Carbon::parse($value)->toIso8601String() : null;
    }

    /**
     * GET /verification/agencies - how far each agency's owner login has got.
     *
     * Read straight from the login itself: entering the phone code stamps
     * phone_verified_at, the email code stamps email_verified_at, and a
     * completed sign-in stamps last_login_at. So this is what actually
     * happened, not a separate record that could drift from it.
     */
    public function agencies(Request $request)
    {
        $auth = $request->attributes->get('auth_user');
        if (! in_array($auth['roleSlug'] ?? null, self::GLOBAL_ROLES, true)) {
            throw new ApiException(403, "Only the administrator can see every agency's verification.");
        }

        $agencies = Agency::orderByDesc('created_at')->orderByDesc('id')->get();

        $owners = User::whereIn('agency_id', $agencies->pluck('id'))
            ->where('role_slug', 'agency_owner')
            ->get()
            ->keyBy('agency_id');

        $rows = $agencies
            ->map(fn (Agency $agency) => $this->verificationRow($agency, $owners->get($agency->id)))
            ->values();

        return ApiResponse::ok($rows);
    }

    /** One agency: each step, where it stands overall, and what is still left. */
    private function verificationRow(Agency $agency, ?User $owner): array
    {
        $steps = [
            'approved' => $agency->status === 'active',
            'phoneVerifiedAt' => $this->iso($owner?->phone_verified_at),
            'emailVerifiedAt' => $this->iso($owner?->email_verified_at),
            'signedInAt' => $this->iso($owner?->last_login_at),
        ];

        $pending = [];
        if (! $owner) {
            $pending[] = 'No owner login is linked to this agency';
        }
        if ($agency->status === 'pending') {
            $pending[] = 'Approve the agency';
        }
        if ($owner) {
            if (! $steps['phoneVerifiedAt']) {
                $pending[] = 'Verify the phone number';
            }
            if (! $steps['emailVerifiedAt']) {
                $pending[] = 'Verify the email address';
            }
            if (! $steps['signedInAt']) {
                $pending[] = 'Sign in for the first time';
            }
        }

        $nothingDone = ! $steps['phoneVerifiedAt'] && ! $steps['emailVerifiedAt'] && ! $steps['signedInAt'];

        $state = match (true) {
            ! $owner => 'no_login',
            $agency->status === 'deactivated' => 'deactivated',
            $agency->status === 'pending' => 'awaiting_approval',
            $pending === [] => 'verified',
            $nothingDone => 'not_signed_in',
            default => 'partial',
        };

        return [
            'id' => $agency->id,
            'name' => $agency->name,
            'code' => $agency->code,
            'status' => $agency->status,
            'createdAt' => $agency->created_at,
            'owner' => $owner ? [
                'name' => $owner->name,
                'username' => $owner->username,
                'email' => $owner->email,
                'phone' => $owner->phone,
            ] : null,
            'steps' => $steps,
            'state' => $state,
            'pending' => $pending,
        ];
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

    /**
     * DELETE /verification/emails/:id
     *
     * Drops the request outright. It is only a record of a confirmation link
     * that was sent, so nothing else hangs off it - the account itself lives
     * in the users table and is untouched.
     *
     * Administrator only: every other authenticated role either owns no part
     * of this list (an agency) or is read-only (an auditor).
     */
    public function destroy(Request $request, string $id)
    {
        $auth = $request->attributes->get('auth_user');
        if (($auth['roleSlug'] ?? null) !== 'main_admin') {
            throw new ApiException(403, 'Only the administrator can remove a verification request.');
        }

        $record = EmailVerification::find($id);
        if (! $record) {
            throw new ApiException(404, 'Verification request not found.');
        }

        $email = $record->email;
        $record->delete();

        return ApiResponse::ok(['id' => $id], $email.' has been removed from the list.');
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
