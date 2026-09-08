<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Models\User;
use App\Services\EmailService;
use App\Services\OtpService;
use App\Services\SmsService;
use App\Support\ApiResponse;
use App\Support\Jwt;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

/**
 * Sign-in is a three-step flow. A session token is issued only after BOTH
 * factors are confirmed:
 *
 *   1. POST /auth/login         -> credentials  -> SMS code   (phone challenge)
 *   2. POST /auth/verify-otp    -> phone code   -> email code (email challenge)
 *   3. POST /auth/verify-email  -> email code   -> JWT token
 */
class AuthController extends Controller
{
    /**
     * The code is echoed to the UI only when the provider could not actually
     * deliver it. Unlike the Node version this is not gated on APP_ENV, so a
     * fresh deployment without SMTP/SMS still lets the admin sign in; set
     * SHOW_DEV_OTP=false once real delivery is configured.
     */
    private function devCode(string $code, array $sent): ?string
    {
        if (! empty($sent['delivered'])) {
            return null;
        }
        $show = filter_var(env('SHOW_DEV_OTP', true), FILTER_VALIDATE_BOOL);

        return $show ? $code : null;
    }

    private function nowSql(): string
    {
        return now()->format('Y-m-d H:i:s');
    }

    /** POST /auth/register */
    public function register(Request $request)
    {
        $data = $request->all();
        Validator::make($data, [
            'name' => 'required|string|min:3|max:120',
            'email' => 'required|email',
            'phone' => ['required', 'string', 'regex:/^[0-9+\s-]{9,20}$/'],
            'password' => ['required', 'string', 'min:8', 'regex:/[A-Z]/', 'regex:/[0-9]/'],
            'confirmPassword' => 'required|same:password',
        ], [
            'name.min' => 'Name must be at least 3 characters.',
            'email.email' => 'Enter a valid email address.',
            'phone.regex' => 'Enter a valid phone number.',
            'password.min' => 'Password must be at least 8 characters.',
            'password.regex' => 'Password must include an uppercase letter and a number.',
            'confirmPassword.same' => 'Passwords do not match.',
        ])->validate();

        $errors = [];
        if (User::emailExists($data['email'])) {
            $errors['email'] = 'That email is already registered.';
        }
        if (User::phoneExists($data['phone'])) {
            $errors['phone'] = 'That phone number is already registered.';
        }
        if ($errors) {
            throw new ApiException(409, 'This account already exists.', $errors);
        }

        $user = User::create([
            'name' => trim($data['name']),
            'email' => strtolower(trim($data['email'])),
            'phone' => trim($data['phone']),
            'password_hash' => password_hash($data['password'], PASSWORD_BCRYPT),
            'role_slug' => 'agent',
            'status' => env('REGISTRATION_DEFAULT_STATUS') ?: 'active',
        ]);

        return ApiResponse::created(
            ['id' => $user->id, 'name' => $user->name, 'email' => $user->email, 'status' => $user->status],
            $user->status === 'active'
                ? 'Account created. You can sign in now.'
                : 'Account created and is awaiting approval.'
        );
    }

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

        $user = $row->toPublic();
        if ($user['status'] !== 'active') {
            throw new ApiException(
                403,
                $user['status'] === 'pending'
                    ? 'This account is awaiting approval.'
                    : 'This account has been deactivated. Contact system support.'
            );
        }

        $challenge = OtpService::createChallenge($user['id'], $user['phone'], 'sms');
        $sent = SmsService::sendOtp($user['phone'], $challenge['code']);

        return ApiResponse::ok([
            'nextStep' => 'phone',
            'challengeId' => $challenge['id'],
            'channel' => 'sms',
            'maskedPhone' => OtpService::maskPhone($user['phone']),
            'resendCooldown' => OtpService::resendCooldown(),
            'devCode' => $this->devCode($challenge['code'], $sent),
        ]);
    }

    /** POST /auth/verify-otp - step 2. */
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

        $emailChallenge = OtpService::createChallenge($user->id, $user->email, 'email', ['phoneVerified' => true]);
        $sent = EmailService::sendOtp($user->email, $emailChallenge['code']);

        return ApiResponse::ok([
            'verified' => 'phone',
            'nextStep' => 'email',
            'challengeId' => $emailChallenge['id'],
            'channel' => 'email',
            'maskedEmail' => OtpService::maskEmail($user->email),
            'resendCooldown' => OtpService::resendCooldown(),
            'devCode' => $this->devCode($emailChallenge['code'], $sent),
        ], 'Phone number verified. Now confirm your email address.');
    }

    /** POST /auth/verify-email - step 3. */
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

        $user->last_login_at = $this->nowSql();
        $user->email_verified_at = $this->nowSql();
        $user->save();

        $public = $user->toPublic();

        return ApiResponse::ok([
            'verified' => 'email',
            'nextStep' => 'dashboard',
            'token' => Jwt::sign($public),
            'admin' => [
                'id' => $public['id'],
                'name' => $public['name'],
                'email' => $public['email'],
                'role' => $public['role'],
                'roleSlug' => $public['roleSlug'],
            ],
        ], 'Verification complete.');
    }

    /** POST /auth/resend-otp - honours the 59-second cooldown. */
    public function resendOtp(Request $request)
    {
        $data = $request->all();
        Validator::make($data, ['challengeId' => 'required'], [
            'challengeId.required' => 'Challenge id is required.',
        ])->validate();

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
            'devCode' => $this->devCode($result['code'], $sent),
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
        $public = $user->toPublic();

        return ApiResponse::ok([
            'id' => $public['id'],
            'name' => $public['name'],
            'email' => $public['email'],
            'role' => $public['role'],
            'roleSlug' => $public['roleSlug'],
        ]);
    }

    /** POST /auth/logout - stateless JWT, so this only clears the cookie. */
    public function logout(Request $request)
    {
        return ApiResponse::ok(null, 'Signed out.')->withoutCookie('token');
    }
}
