<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Models\Agency;
use App\Models\OtpChallenge;
use App\Models\User;
use App\Services\EmailService;
use App\Services\OtpService;
use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

/**
 * A forgotten password, reset through the account's email:
 *
 *   1. POST /auth/forgot-password         -> username    -> email code
 *   2. POST /auth/forgot-password/verify  -> email code  -> reset token
 *   3. POST /auth/forgot-password/reset   -> reset token -> new password
 *
 * The username names the account and the code proves the person holds its
 * email, so knowing a username alone is never enough to change a password.
 */
class PasswordResetController extends Controller
{
    /** A code has been emailed and is waiting to be entered. */
    private const PURPOSE = 'password_reset';

    /** The code was entered; the new password may now be set. */
    private const READY = 'password_reset_ready';

    private const EXPIRED = 'This reset session has expired. Please start again.';

    /** A challenge this flow opened at the given stage - never a sign-in one. */
    private function challenge($id, string $purpose): OtpChallenge
    {
        $challenge = $id ? OtpService::getChallenge((string) $id) : null;

        if (! $challenge || ($challenge->meta['purpose'] ?? null) !== $purpose) {
            throw new ApiException(400, self::EXPIRED);
        }

        return $challenge;
    }

    /** POST /auth/forgot-password - finds the account and emails it a code. */
    public function start(Request $request)
    {
        Validator::make($request->all(), [
            'username' => 'required|string|max:190',
        ], [
            'username.required' => 'Enter your username.',
        ])->validate();

        $user = User::findByLoginWithHash($request->input('username'));
        if (! $user) {
            $message = 'No account was found with that username.';
            throw new ApiException(404, $message, ['username' => $message]);
        }

        // Same rule and wording as sign-in, which would refuse these accounts
        // anyway - including a login whose agency is not approved yet.
        $refusal = $user->signInRefusal();
        if ($refusal) {
            throw new ApiException(403, $refusal);
        }

        $email = trim((string) $user->email);
        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new ApiException(422, 'This account has no email address on file. Contact the administrator.');
        }

        $challenge = OtpService::createChallenge($user->id, $email, 'email', ['purpose' => self::PURPOSE]);
        $sent = EmailService::sendOtp($email, $challenge['code'], 'reset your password');
        $masked = OtpService::maskEmail($email);

        return ApiResponse::ok([
            'challengeId' => $challenge['id'],
            // Whatever was typed - username, email or phone - the account's
            // own username is what the page confirms back.
            'username' => $user->username,
            'maskedEmail' => $masked,
            'resendCooldown' => OtpService::resendCooldown(),
            'devCode' => OtpService::devCode($challenge['code'], $sent),
        ], 'A verification code has been sent to '.$masked.'.');
    }

    /** POST /auth/forgot-password/resend - honours the same cooldown as sign-in. */
    public function resend(Request $request)
    {
        $challenge = $this->challenge($request->input('challengeId'), self::PURPOSE);

        $result = OtpService::rotateCode($challenge->id);
        if (! $result['ok']) {
            $suffix = isset($result['retryAfter']) ? ' ('.$result['retryAfter'].'s)' : '';
            throw new ApiException(429, $result['reason'].$suffix);
        }

        $sent = EmailService::sendOtp($challenge->destination, $result['code'], 'reset your password');

        return ApiResponse::ok([
            'cooldown' => $result['cooldown'],
            'devCode' => OtpService::devCode($result['code'], $sent),
        ], 'A new code has been sent.');
    }

    /** POST /auth/forgot-password/verify - the code came back, so a reset token is issued. */
    public function verify(Request $request)
    {
        Validator::make($request->all(), [
            'challengeId' => 'required|string',
            'code' => 'required|string|size:6',
        ], [
            'challengeId.required' => self::EXPIRED,
            'code.size' => 'Enter the 6-digit code.',
        ])->validate();

        $challenge = $this->challenge($request->input('challengeId'), self::PURPOSE);

        $result = OtpService::verifyChallenge($challenge->id, (string) $request->input('code'), 'email');
        if (! $result['ok']) {
            throw new ApiException(400, str_replace('Please sign in again.', 'Please start again.', $result['reason']));
        }

        // A fresh id rather than the one the code was typed against, so the
        // code cannot be replayed to reach this step a second time.
        $ready = OtpService::createChallenge(
            (int) $result['challenge']->admin_id,
            $result['challenge']->destination,
            'email',
            ['purpose' => self::READY]
        );

        return ApiResponse::ok(['resetToken' => $ready['id']], 'Code accepted. Choose a new password.');
    }

    /** POST /auth/forgot-password/reset */
    public function reset(Request $request)
    {
        // Checked before the token is spent, so a weak password can be retried.
        Validator::make($request->all(), [
            'resetToken' => 'required|string',
            'password' => ['required', 'string', 'min:8', 'max:72', 'regex:/[A-Z]/', 'regex:/[0-9]/'],
            'passwordConfirmation' => 'required|same:password',
        ], [
            'resetToken.required' => self::EXPIRED,
            'password.required' => 'Enter a new password.',
            'password.min' => 'Password must be at least 8 characters.',
            'password.max' => 'Password must be 72 characters or fewer.',
            'password.regex' => 'Password must include an uppercase letter and a number.',
            'passwordConfirmation.required' => 'Confirm the new password.',
            'passwordConfirmation.same' => 'The passwords do not match.',
        ])->validate();

        $ready = $this->challenge($request->input('resetToken'), self::READY);
        if ((int) round(microtime(true) * 1000) > $ready->expires_at) {
            $ready->delete();
            throw new ApiException(400, self::EXPIRED);
        }

        $user = User::find($ready->admin_id);
        if (! $user) {
            $ready->delete();
            throw new ApiException(404, 'Account not found.');
        }

        $password = (string) $request->input('password');
        if (User::verifyPassword($password, $user->password_hash)) {
            $message = 'Choose a password you are not already using.';
            throw new ApiException(422, $message, ['password' => $message]);
        }

        $hash = password_hash($password, PASSWORD_BCRYPT);

        DB::transaction(function () use ($user, $hash) {
            $user->password_hash = $hash;
            // Entering the code proved the address.
            $user->email_verified_at = now()->format('Y-m-d H:i:s');
            $user->save();

            // The agency row keeps a copy of its owner's password, the same
            // way AgencyController::resetCredentials() rotates both.
            if ($user->role_slug === 'agency_owner' && $user->agency_id) {
                Agency::where('id', $user->agency_id)->update(['password_hash' => $hash]);
            }

            // The token is spent, and any other code still open for this
            // account belonged to the old password.
            OtpChallenge::where('admin_id', $user->id)->delete();
        });

        return ApiResponse::ok(
            ['username' => $user->username],
            'Your password has been updated. You can now sign in.'
        );
    }
}
