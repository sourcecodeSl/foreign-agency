<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\OtpService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * Agency sign-in is a three-step flow. A token is issued only once BOTH the
 * phone and the email have been confirmed:
 *
 *   1. POST /auth/login         credentials -> SMS code   (phone challenge)
 *   2. POST /auth/verify-phone  phone code  -> email code (email challenge)
 *   3. POST /auth/verify-email  email code  -> API token
 *
 * The challenge id is rotated between steps, so a phone code can never be
 * replayed against the email step.
 *
 * Candidates never authenticate, so none of this applies to them.
 */
class AuthController extends Controller
{
    public function __construct(private OtpService $otp) {}

    /** Step 1 - password check, then the phone code. */
    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'username' => ['required', 'string'],
            'password' => ['required', 'string'],
        ]);

        $user = $this->resolveUser($data['username']);

        // Identical failure for unknown accounts and wrong passwords, so the
        // endpoint cannot be used to discover which logins exist.
        if (! $user || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages([
                'username' => ['Invalid username or password.'],
            ])->status(401);
        }

        if (! $user->isActive()) {
            return $this->fail('This account is not active. Contact the administrator.', 403);
        }

        if ($user->isAgency() && ! $user->agency?->isActive()) {
            return $this->fail('This agency is not active yet.', 403);
        }

        // Roles outside otp.required_roles skip straight to a token.
        if (! $user->requiresOtp()) {
            return $this->issueToken($user, 'Signed in.');
        }

        $issued = $this->otp->issue($user, 'sms');

        return $this->ok([
            'next_step' => 'phone',
            'challenge_id' => $issued['challenge']->id,
            'channel' => 'sms',
            'masked_phone' => $this->otp->maskPhone($user->phone),
            'resend_cooldown' => config('otp.resend_cooldown'),
            'dev_code' => $this->otp->exposeCode($issued['code'], $issued['delivered']),
        ]);
    }

    /** Step 2 - phone confirmed, open the email challenge. No token yet. */
    public function verifyPhone(Request $request): JsonResponse
    {
        $data = $request->validate([
            'challenge_id' => ['required', 'string'],
            'code' => ['required', 'string'],
        ]);

        $result = $this->otp->verify($data['challenge_id'], $data['code'], 'sms');
        if (! $result['ok']) {
            return $this->fail($result['reason'], 400);
        }

        $user = $result['challenge']->user;
        $user->forceFill(['phone_verified_at' => now()])->save();

        $issued = $this->otp->issue($user, 'email', ['phone_verified' => true]);

        return $this->ok([
            'verified' => 'phone',
            'next_step' => 'email',
            'challenge_id' => $issued['challenge']->id,
            'channel' => 'email',
            'masked_email' => $this->otp->maskEmail($user->email),
            'resend_cooldown' => config('otp.resend_cooldown'),
            'dev_code' => $this->otp->exposeCode($issued['code'], $issued['delivered']),
        ], 'Phone number verified. Now confirm your email address.');
    }

    /** Step 3 - both factors confirmed, so the token is issued here. */
    public function verifyEmail(Request $request): JsonResponse
    {
        $data = $request->validate([
            'challenge_id' => ['required', 'string'],
            'code' => ['required', 'string'],
        ]);

        $result = $this->otp->verify($data['challenge_id'], $data['code'], 'email');
        if (! $result['ok']) {
            return $this->fail($result['reason'], 400);
        }

        $challenge = $result['challenge'];

        // Defence in depth: this challenge is only created after the phone
        // step, but check the flag rather than trusting the flow.
        if (! $challenge->phone_verified) {
            return $this->fail('Verify your phone number before confirming your email.', 400);
        }

        $user = $challenge->user;
        $user->forceFill(['email_verified_at' => now()])->save();

        return $this->issueToken($user, 'Verification complete.');
    }

    /** Re-sends the code for whichever step is in flight. */
    public function resend(Request $request): JsonResponse
    {
        $data = $request->validate([
            'challenge_id' => ['required', 'string'],
        ]);

        $result = $this->otp->resend($data['challenge_id']);

        if (! $result['ok']) {
            $message = $result['reason'];
            if (isset($result['retry_after'])) {
                $message .= ' (' . $result['retry_after'] . 's)';
            }

            return $this->fail($message, isset($result['retry_after']) ? 429 : 400);
        }

        return $this->ok([
            'channel' => $result['challenge']->channel,
            'cooldown' => config('otp.resend_cooldown'),
            'dev_code' => $this->otp->exposeCode($result['code'], $result['delivered']),
        ], 'A new code has been sent.');
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user()->load('agency');

        return $this->ok($this->userPayload($user));
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return $this->ok(null, 'Signed out.');
    }

    /** Accepts an email, a username or a phone number as the identifier. */
    private function resolveUser(string $identifier): ?User
    {
        $value = trim($identifier);
        $digits = preg_replace('/\D/', '', $value);

        return User::with('agency')
            ->where('email', mb_strtolower($value))
            ->orWhere('username', $value)
            // Single quotes inside the raw SQL: SQLite reads double quotes as
            // identifiers, so "+" there would not be a string literal.
            ->when($digits !== '', fn ($q) => $q->orWhereRaw(
                "REPLACE(REPLACE(phone, ' ', ''), '+', '') = ?", [$digits]
            ))
            ->first();
    }

    private function issueToken(User $user, string $message): JsonResponse
    {
        $user->forceFill(['last_login_at' => now()])->save();

        $token = $user->createToken('api', ['role:' . $user->role->value])->plainTextToken;

        return $this->ok([
            'verified' => 'email',
            'next_step' => 'dashboard',
            'token' => $token,
            'user' => $this->userPayload($user->load('agency')),
        ], $message);
    }

    private function userPayload(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'username' => $user->username,
            'email' => $user->email,
            'phone' => $user->phone,
            'role' => $user->role->value,
            'role_label' => $user->role->label(),
            'must_change_password' => $user->must_change_password,
            'agency' => $user->agency ? [
                'id' => $user->agency->id,
                'code' => $user->agency->code,
                'name' => $user->agency->name,
                'status' => $user->agency->status->value,
            ] : null,
        ];
    }

    private function ok(mixed $data, ?string $message = null): JsonResponse
    {
        return response()->json(['success' => true, 'data' => $data, 'message' => $message]);
    }

    private function fail(string $message, int $status): JsonResponse
    {
        return response()->json(['success' => false, 'message' => $message], $status);
    }
}
