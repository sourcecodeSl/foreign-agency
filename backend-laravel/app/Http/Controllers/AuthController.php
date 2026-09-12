<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Models\Agency;
use App\Models\User;
use App\Services\EmailService;
use App\Services\OtpService;
use App\Services\SmsService;
use App\Support\ApiResponse;
use App\Support\Jwt;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

/**
 * Sign-in asks for a code only where one is still owed:
 *
 *   1. POST /auth/login         -> credentials
 *   2. POST /auth/verify-otp    -> phone code   (while the phone is unconfirmed)
 *   3. POST /auth/verify-email  -> email code   (while the email is unconfirmed)
 *
 * The Main Admin is never asked for a code. Every other login confirms its
 * phone and email once, on its first sign-in, and from then on the password
 * alone opens the session. Each step answers with the nextStep - 'phone',
 * 'email', or 'dashboard' carrying the token.
 */
class AuthController extends Controller
{
    private function nowSql(): string
    {
        return now()->format('Y-m-d H:i:s');
    }

    /**
     * Codes opened for an agency's contact change or a password reset live in
     * the same table, so every sign-in step refuses them before trying the code.
     */
    private function refuseOtherPurposes($challengeId): void
    {
        $pending = OtpService::getChallenge((string) $challengeId);
        if ($pending && ! empty($pending->meta['purpose'])) {
            throw new ApiException(400, 'Wrong verification step for this session.');
        }
    }

    /** What the client keeps about the signed-in account. */
    private function sessionUser(User $user): array
    {
        $public = $user->toPublic();
        $agency = $user->agency_id ? Agency::find($user->agency_id) : null;

        return [
            'id' => $public['id'],
            'username' => $public['username'],
            'name' => $public['name'],
            'email' => $public['email'],
            'role' => $public['role'],
            'roleSlug' => $public['roleSlug'],
            // The sidebar brands an agency login with its agency's name.
            'agency' => $agency ? ['id' => $agency->id, 'name' => $agency->name] : null,
        ];
    }

    /**
     * Opens the next code this login still owes or, once none is left, the
     * session. `$done` names the step just completed, for the message.
     */
    private function continueSignIn(User $user, array $extra = [], string $done = '')
    {
        $left = $user->unconfirmedContacts();
        $lead = $done === '' ? '' : $done.' ';

        if (in_array('phone', $left, true)) {
            $challenge = OtpService::createChallenge($user->id, $user->phone, 'sms');
            $sent = SmsService::sendOtp($user->phone, $challenge['code']);

            return ApiResponse::ok($extra + [
                'nextStep' => 'phone',
                // Every code this sign-in still asks for, this one first.
                'steps' => $left,
                'challengeId' => $challenge['id'],
                'channel' => 'sms',
                'maskedPhone' => OtpService::maskPhone($user->phone),
                'resendCooldown' => OtpService::resendCooldown(),
                'devCode' => OtpService::devCode($challenge['code'], $sent),
            ], $lead.'Enter the code sent to your phone.');
        }

        if (in_array('email', $left, true)) {
            // The phone is confirmed on record, whether just now or on an
            // earlier sign-in, so verify-email accepts this challenge.
            $challenge = OtpService::createChallenge($user->id, $user->email, 'email', ['phoneVerified' => true]);
            $sent = EmailService::sendOtp($user->email, $challenge['code']);

            return ApiResponse::ok($extra + [
                'nextStep' => 'email',
                'steps' => $left,
                'challengeId' => $challenge['id'],
                'channel' => 'email',
                'maskedEmail' => OtpService::maskEmail($user->email),
                'resendCooldown' => OtpService::resendCooldown(),
                'devCode' => OtpService::devCode($challenge['code'], $sent),
            ], $lead.'Now confirm your email address.');
        }

        // The agency may have been deactivated while a code was open.
        $refusal = $user->signInRefusal();
        if ($refusal) {
            throw new ApiException(403, $refusal);
        }

        $user->last_login_at = $this->nowSql();
        $user->save();

        return ApiResponse::ok($extra + [
            'nextStep' => 'dashboard',
            'steps' => [],
            'token' => Jwt::sign($user->toPublic()),
            'admin' => $this->sessionUser($user),
        ], $lead.'Signed in.');
    }

    /*
     * There is deliberately no register() action. Accounts are never
     * self-created: the Main Admin is seeded and agency logins are issued
     * from the admin panel via AgencyController::store().
     */

    /** POST /auth/login - step 1. */
    public function login(Request $request)
    {
        $data = $request->all();
        Validator::make($data, [
            'username' => 'required|string',
            'password' => 'string|min:6',
        ], [
            'username.required' => 'Username is required.',
            'password.min' => 'Password must be at least 6 characters.',
        ])->validate();

        $row = User::findByLoginWithHash($data['username']);

        if (! $row || ! User::verifyPassword($data['password'], $row->password_hash)) {
            throw new ApiException(401, 'Invalid username or password.');
        }

        // Only after the password matched, so a wrong guess never learns
        // whether the account or its agency is approved.
        $refusal = $row->signInRefusal();
        if ($refusal) {
            throw new ApiException(403, $refusal);
        }

        return $this->continueSignIn($row);
    }

    /** POST /auth/verify-otp - the phone code. */
    public function verifyOtp(Request $request)
    {
        $data = $request->all();
        Validator::make($data, [
            'challengeId' => 'required',
            'code' => 'required|string|size:6',
        ], [
            'challengeId.required' => 'Challenge id is required.',
            'code.size' => 'Enter the 6-digit code.',
        ])->validate();

        $this->refuseOtherPurposes($data['challengeId']);

        $result = OtpService::verifyChallenge($data['challengeId'], $data['code'], 'sms');
        if (! $result['ok']) {
            throw new ApiException(400, $result['reason']);
        }

        $user = User::find($result['challenge']->admin_id);
        if (! $user) {
            throw new ApiException(404, 'Account not found.');
        }

        $user->phone_verified_at = $this->nowSql();
        $user->save();

        return $this->continueSignIn($user, ['verified' => 'phone'], 'Phone number verified.');
    }

    /** POST /auth/verify-email - the email code. */
    public function verifyEmail(Request $request)
    {
        $data = $request->all();
        Validator::make($data, [
            'challengeId' => 'required',
            'code' => 'required|string|size:6',
        ], [
            'challengeId.required' => 'Challenge id is required.',
            'code.size' => 'Enter the 6-digit code.',
        ])->validate();

        $this->refuseOtherPurposes($data['challengeId']);

        $result = OtpService::verifyChallenge($data['challengeId'], $data['code'], 'email');
        if (! $result['ok']) {
            throw new ApiException(400, $result['reason']);
        }

        if (empty($result['challenge']->meta['phoneVerified'])) {
            throw new ApiException(400, 'Verify your phone number before confirming your email.');
        }

        $user = User::find($result['challenge']->admin_id);
        if (! $user) {
            throw new ApiException(404, 'Account not found.');
        }

        $user->email_verified_at = $this->nowSql();
        $user->save();

        return $this->continueSignIn($user, ['verified' => 'email'], 'Email address verified.');
    }

    /** POST /auth/resend-otp - honours the 59-second cooldown. */
    public function resendOtp(Request $request)
    {
        $data = $request->all();
        Validator::make($data, ['challengeId' => 'required'], [
            'challengeId.required' => 'Challenge id is required.',
        ])->validate();

        $this->refuseOtherPurposes($data['challengeId']);

        $result = OtpService::rotateCode($data['challengeId']);
        if (! $result['ok']) {
            $suffix = isset($result['retryAfter']) ? ' ('.$result['retryAfter'].'s)' : '';
            throw new ApiException(429, $result['reason'].$suffix);
        }

        $challenge = OtpService::getChallenge($data['challengeId']);

        $sent = $challenge->channel === 'email'
            ? EmailService::sendOtp($challenge->destination, $result['code'])
            : SmsService::sendOtp($challenge->destination, $result['code']);

        return ApiResponse::ok([
            'resentAt' => now()->toIso8601String(),
            'channel' => $challenge->channel,
            'cooldown' => $result['cooldown'],
            'devCode' => OtpService::devCode($result['code'], $sent),
        ], 'A new code has been sent.');
    }

    /** GET /auth/me */
    public function me(Request $request)
    {
        $auth = $request->attributes->get('auth_user');
        $user = User::find($auth['sub']);
        if (! $user) {
            throw new ApiException(404, 'Account not found.');
        }

        return ApiResponse::ok($this->sessionUser($user));
    }

    /** POST /auth/logout - stateless JWT, so this only clears the cookie. */
    public function logout(Request $request)
    {
        return ApiResponse::ok(null, 'Signed out.')->withoutCookie('token');
    }
}
