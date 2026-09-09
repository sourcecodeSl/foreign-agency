<?php

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Foundation\Application;

/**
 * Runs pending migrations from the browser.
 *
 * Shared hosting has no terminal, so `php artisan migrate` is not available on
 * the live site. Uploading files is, which is all this needs: open it once
 * after a deploy and it applies whatever migrations are outstanding.
 *
 * It is inert until UPGRADE_TOKEN is set in .env, and the token has to be
 * repeated in the URL, so an uploaded copy that nobody configured does nothing:
 *
 *     https://your-site/upgrade.php?token=THE_TOKEN
 *
 * Clear UPGRADE_TOKEN again (or delete this file) once the upgrade is done.
 */
header('Content-Type: text/plain; charset=utf-8');
header('X-Robots-Tag: noindex, nofollow');

/**
 * Reads one key straight out of .env.
 *
 * Deliberately not env(): a cached config skips Dotenv entirely, and the gate
 * has to hold before Laravel is booted at all.
 */
function upgradeToken(string $envPath): string
{
    if (! is_readable($envPath)) {
        return '';
    }

    foreach (file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || ! str_starts_with($line, 'UPGRADE_TOKEN')) {
            continue;
        }

        [, $value] = array_pad(explode('=', $line, 2), 2, '');

        return trim(trim(trim($value), '"\''));
    }

    return '';
}

$expected = upgradeToken(__DIR__.'/../.env');

// A short token is not a token; refusing is safer than pretending it guards.
if (strlen($expected) < 16) {
    http_response_code(403);
    exit(
        "Upgrades are switched off.\n\n".
        "Add a long random UPGRADE_TOKEN to .env (at least 16 characters), then\n".
        "open this page again as upgrade.php?token=THE_TOKEN\n"
    );
}

$given = (string) ($_GET['token'] ?? '');

if (! hash_equals($expected, $given)) {
    http_response_code(403);
    exit("Wrong or missing token.\n");
}

require __DIR__.'/../vendor/autoload.php';

/** @var Application $app */
$app = require_once __DIR__.'/../bootstrap/app.php';

$kernel = $app->make(Kernel::class);
$kernel->bootstrap();

// A migration can outlast the default 30 seconds on a slow shared host.
@set_time_limit(300);

echo "Pending migrations\n";
echo "==================\n\n";

$kernel->call('migrate', ['--force' => true, '--no-interaction' => true]);
echo $kernel->output();

echo "\nCurrent state\n";
echo "=============\n\n";

$kernel->call('migrate:status', ['--no-interaction' => true]);
echo $kernel->output();

echo "\nDone. Now remove UPGRADE_TOKEN from .env (or delete public/upgrade.php)\n";
echo "so this page cannot be run again.\n";
