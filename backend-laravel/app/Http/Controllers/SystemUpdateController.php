<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * /api/v1/system/update - brings the database up to date from a browser.
 *
 * For a live server where neither the database nor php artisan can be
 * reached. It runs the same migrations `php artisan migrate` would, and
 * nothing else: no seeding, no rollback.
 *
 * It is switched off unless MIGRATE_KEY (32+ characters) is set in .env, and
 * even then the key is typed into the page, never put in the address, so it
 * stays out of server logs and browser history. Opening the page changes
 * nothing; the pending updates are listed first and run only on request.
 */
class SystemUpdateController extends Controller
{
    private const MIN_KEY_LENGTH = 32;

    /** GET - asks for the key. */
    public function show()
    {
        $this->requireEnabled();

        return $this->page('Database update', $this->keyForm());
    }

    /** POST { key, action: check|run } */
    public function handle(Request $request)
    {
        $this->requireEnabled();

        $given = (string) $request->input('key', '');
        if (! hash_equals((string) config('app.migrate_key'), $given)) {
            Log::warning('System update: wrong key', ['ip' => $request->ip()]);

            return $this->page('Database update', $this->notice('That key is not right.', 'error').$this->keyForm(), 403);
        }

        return $request->input('action') === 'run'
            ? $this->run($request, $given)
            : $this->check($given);
    }

    /** What is waiting to run, with the button that runs it. */
    private function check(string $key)
    {
        try {
            [$ran, $pending] = $this->status();
        } catch (Throwable $e) {
            return $this->page('Database update', $this->notice('The database could not be reached: '.$e->getMessage(), 'error'), 500);
        }

        if ($pending === []) {
            return $this->page('Database update', $this->notice(
                'The database is up to date. All '.count($ran).' updates have already run.', 'ok'
            ));
        }

        $list = implode('', array_map(fn ($name) => '<li><code>'.e($name).'</code></li>', $pending));

        return $this->page('Database update',
            $this->notice(count($pending).' update'.(count($pending) === 1 ? ' is' : 's are').' waiting to run:', 'info')
            .'<ul>'.$list.'</ul>'
            .'<p class="muted">Take a backup of the database first. Each update runs once; the ones already run are skipped.</p>'
            .'<form method="post">'
            .'<input type="hidden" name="key" value="'.e($key).'">'
            .'<input type="hidden" name="action" value="run">'
            .'<button type="submit">Run update</button>'
            .'</form>'
        );
    }

    /** Runs every pending migration, as `php artisan migrate --force` would. */
    private function run(Request $request, string $key)
    {
        @set_time_limit(300);

        try {
            [, $before] = $this->status();
            $code = Artisan::call('migrate', ['--force' => true]);
            $output = Artisan::output();
            [, $after] = $this->status();
        } catch (Throwable $e) {
            Log::error('System update failed', ['ip' => $request->ip(), 'error' => $e->getMessage()]);

            return $this->page('Database update',
                $this->notice('The update stopped with an error. Nothing after the failing step was run.', 'error')
                .'<pre>'.e($e->getMessage()).'</pre>', 500);
        }

        $done = array_values(array_diff($before, $after));
        Log::warning('System update run', ['ip' => $request->ip(), 'ran' => $done, 'exit' => $code]);

        $ok = $code === 0 && $after === [];

        return $this->page('Database update',
            $this->notice($ok
                ? 'Done. '.count($done).' update'.(count($done) === 1 ? '' : 's').' ran, and the database is up to date.'
                : 'The update did not finish. See the output below.', $ok ? 'ok' : 'error')
            .'<pre>'.e(trim($output) ?: 'Nothing to run.').'</pre>'
            .'<form method="post">'
            .'<input type="hidden" name="key" value="'.e($key).'">'
            .'<input type="hidden" name="action" value="check">'
            .'<button type="submit" class="secondary">Check again</button>'
            .'</form>',
            $ok ? 200 : 500
        );
    }

    /**
     * The migrations already run, and the ones still waiting, by name.
     *
     * @return array{0: string[], 1: string[]}
     */
    private function status(): array
    {
        $migrator = app('migrator');
        $files = array_keys($migrator->getMigrationFiles(database_path('migrations')));

        $ran = $migrator->repositoryExists() ? $migrator->getRepository()->getRan() : [];

        return [$ran, array_values(array_diff($files, $ran))];
    }

    /** Switched off, the page is not there at all. */
    private function requireEnabled(): void
    {
        abort_if(strlen((string) config('app.migrate_key')) < self::MIN_KEY_LENGTH, 404);
    }

    private function keyForm(): string
    {
        return '<form method="post">'
            .'<label for="key">Update key</label>'
            .'<input id="key" name="key" type="password" autocomplete="off" required autofocus>'
            .'<input type="hidden" name="action" value="check">'
            .'<button type="submit">Check for updates</button>'
            .'</form>'
            .'<p class="muted">The key is MIGRATE_KEY in the server\'s .env file.</p>';
    }

    private function notice(string $text, string $tone): string
    {
        return '<p class="notice '.$tone.'">'.e($text).'</p>';
    }

    private function page(string $title, string $body, int $status = 200)
    {
        $html = '<!doctype html><html lang="en"><head><meta charset="utf-8">'
            .'<meta name="viewport" content="width=device-width, initial-scale=1">'
            .'<meta name="robots" content="noindex">'
            .'<title>'.e($title).'</title><style>'
            .'body{font-family:Inter,system-ui,Segoe UI,sans-serif;background:#f9fafb;color:#111827;margin:0;padding:40px 16px}'
            .'main{max-width:640px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:28px}'
            .'h1{font-size:20px;margin:0 0 16px}label{display:block;font-size:14px;font-weight:600;margin-bottom:6px}'
            .'input{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;margin-bottom:14px}'
            .'button{background:#1d41f5;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:14px;font-weight:600;cursor:pointer}'
            .'button.secondary{background:#fff;color:#374151;border:1px solid #d1d5db}'
            .'.notice{padding:12px 14px;border-radius:8px;font-size:14px}.ok{background:#ecfdf5;color:#047857}'
            .'.error{background:#fef2f2;color:#b91c1c}.info{background:#eef4ff;color:#162fe1}'
            .'.muted{color:#6b7280;font-size:13px}code{font-size:13px}'
            .'pre{background:#111827;color:#e5e7eb;padding:14px;border-radius:8px;font-size:12px;overflow:auto;white-space:pre-wrap}'
            .'</style></head><body><main><h1>'.e($title).'</h1>'.$body.'</main></body></html>';

        return response($html, $status)
            ->header('Content-Type', 'text/html; charset=utf-8')
            ->header('Cache-Control', 'no-store')
            ->header('X-Robots-Tag', 'noindex');
    }
}
