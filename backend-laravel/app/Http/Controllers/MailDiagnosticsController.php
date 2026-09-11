<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Models\User;
use App\Services\EmailService;
use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;

/**
 * Email delivery check for the administrator.
 *
 * Shared hosting has no terminal, so there is no easy way to see what the app
 * actually reads. This reports it - which .env file, whether the settings are
 * cached, what the mailer is set to - but never the password itself. A test
 * email goes only to the signed-in administrator's own address, and comes
 * back with the mail server's real error when it fails.
 */
class MailDiagnosticsController extends Controller
{
    private function admin(Request $request): User
    {
        $auth = $request->attributes->get('auth_user');
        if (($auth['roleSlug'] ?? null) !== 'main_admin') {
            throw new ApiException(403, 'Only the administrator can check email delivery.');
        }

        $user = User::find($auth['sub'] ?? null);
        if (! $user) {
            throw new ApiException(404, 'Account not found.');
        }

        return $user;
    }

    private function status(User $admin): array
    {
        $envFile = app()->environmentFilePath();
        // The SMTP block is what the .env MAIL_ lines fill in, whichever
        // mailer is currently the default.
        $smtp = config('mail.mailers.smtp', []);

        return [
            'envFile' => $envFile,
            'envFileExists' => is_file($envFile),
            'configCached' => app()->configurationIsCached(),
            'mailer' => (string) config('mail.default'),
            'host' => $smtp['host'] ?? null,
            'port' => $smtp['port'] ?? null,
            'fromAddress' => config('mail.from.address'),
            'usernameSet' => ! empty($smtp['username']),
            'passwordSet' => ! empty($smtp['password']),
            'configured' => EmailService::isConfigured(),
            'testRecipient' => $admin->email,
        ];
    }

    /** GET /system/mail */
    public function show(Request $request)
    {
        return ApiResponse::ok($this->status($this->admin($request)));
    }

    /** POST /system/mail/test - always to the administrator's own address. */
    public function test(Request $request)
    {
        $admin = $this->admin($request);
        $result = EmailService::sendTest((string) $admin->email);

        return ApiResponse::ok(
            $result + ['to' => $admin->email],
            $result['delivered'] ? 'Test email sent to '.$admin->email.'.' : 'The test email could not be sent.'
        );
    }

    /** POST /system/mail/clear-cache - `php artisan config:clear`, for a host with no terminal. */
    public function clearCache(Request $request)
    {
        $this->admin($request);

        $wasCached = app()->configurationIsCached();
        Artisan::call('config:clear');

        return ApiResponse::ok(
            ['wasCached' => $wasCached],
            $wasCached
                ? 'Cached settings cleared. The .env file is read again from the next request.'
                : 'Nothing was cached - the .env file is already being read.'
        );
    }
}
