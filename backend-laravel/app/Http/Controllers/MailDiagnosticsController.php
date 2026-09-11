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
 * cached, what the mailer is set to, every MAIL_ line in the file and which of
 * them wins, and the latest email / SMS log entries - but never a password or
 * a one-time code. A test email goes only to the signed-in administrator, and
 * comes back with the mail server's real error when it fails.
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
            'envLines' => $this->envMailLines($envFile),
            'recentLog' => $this->recentMailLog(),
        ];
    }

    /**
     * Every line of the .env file that mentions MAIL_, as the loader sees it.
     *
     * When a key appears more than once the LAST line wins - checked against
     * the Dotenv loader Laravel uses - so an old line further down silently
     * overrides a new one added above it. Password values are never returned.
     */
    private function envMailLines(string $file): array
    {
        if (! is_file($file) || ! is_readable($file)) {
            return [];
        }

        $rows = [];
        foreach (preg_split('/\r\n|\r|\n/', (string) file_get_contents($file)) as $index => $raw) {
            if (stripos($raw, 'MAIL_') === false) {
                continue;
            }

            $text = trim($raw);
            $commented = str_starts_with($text, '#');
            $body = $commented ? ltrim(substr($text, 1)) : $text;
            if (str_starts_with($body, 'export ')) {
                $body = substr($body, 7);
            }

            [$name, $value] = array_pad(explode('=', $body, 2), 2, null);
            $name = trim((string) $name);
            // Anything but letters, digits and underscores - a non-breaking
            // space pasted from a chat, say - makes it a different key.
            $key = preg_replace('/[^A-Za-z0-9_]/', '', $name);

            $rows[] = [
                'line' => $index + 1,
                'key' => $key !== '' ? $key : $name,
                'value' => $this->preview($key, $value),
                'commented' => $commented,
                'hiddenCharacters' => $name !== $key,
                'noEquals' => $value === null,
            ];
        }

        // The last readable line of each key is the one Laravel keeps.
        $winner = [];
        foreach ($rows as $row) {
            if (! $row['commented'] && ! $row['hiddenCharacters'] && ! $row['noEquals']) {
                $winner[$row['key']] = $row['line'];
            }
        }

        return array_map(function (array $row) use ($winner) {
            $status = match (true) {
                $row['commented'] => 'commented',
                $row['noEquals'] => 'invalid',
                $row['hiddenCharacters'] => 'hidden_characters',
                ($winner[$row['key']] ?? null) === $row['line'] => 'used',
                default => 'overridden',
            };

            return [
                'line' => $row['line'],
                'key' => $row['key'],
                'value' => $row['value'],
                'status' => $status,
                'overriddenBy' => $status === 'overridden' ? $winner[$row['key']] : null,
            ];
        }, $rows);
    }

    /** What a line holds, with surrounding quotes removed - never a password. */
    private function preview(string $key, ?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $value = trim($value);
        if (strlen($value) >= 2 && ($value[0] === '"' || $value[0] === "'") && str_ends_with($value, $value[0])) {
            $value = substr($value, 1, -1);
        }

        if (str_contains(strtoupper($key), 'PASSWORD')) {
            return $value === '' || strtolower($value) === 'null' ? '(empty)' : '(set - hidden)';
        }

        return $value;
    }

    /** The latest email and SMS entries from the app log, one-time codes blanked out. */
    private function recentMailLog(int $limit = 25): array
    {
        $file = storage_path('logs/laravel.log');
        if (! is_file($file) || ! is_readable($file)) {
            return [];
        }

        // Only the end of the file - nothing rotates this log on shared hosting.
        $handle = fopen($file, 'rb');
        fseek($handle, max(0, filesize($file) - 256 * 1024));
        $tail = (string) stream_get_contents($handle);
        fclose($handle);

        $entries = [];
        foreach (preg_split('/\r\n|\r|\n/', $tail) as $line) {
            // Entries start with a timestamp; stack trace lines do not.
            if (! preg_match('/^\[\d{4}-\d{2}-\d{2}/', $line)) {
                continue;
            }

            $isMail = preg_match('/\[(mail|sms)\]/i', $line)
                || (str_contains($line, '.ERROR:') && preg_match('/mail|smtp|transport/i', $line));
            if (! $isMail) {
                continue;
            }

            // A one-time code in the log is still a working second factor.
            $line = preg_replace('/\b\d{6}\b/', '******', $line);
            $entries[] = strlen($line) > 500 ? substr($line, 0, 500).'...' : $line;
        }

        return array_slice($entries, -$limit);
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
