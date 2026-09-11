<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use App\Exceptions\ApiException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        apiPrefix: 'api/v1',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // Route guards ported from the Express middleware.
        $middleware->alias([
            'auth.jwt' => \App\Http\Middleware\RequireAuth::class,
            'can.perm' => \App\Http\Middleware\RequirePermission::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        // Everything under /api/v1 answers with the same envelope the React
        // client already unwraps: { success, message, errors }.
        $wantsApi = fn (Request $request) => $request->is('api/*') || $request->expectsJson();

        $exceptions->render(function (ValidationException $e, Request $request) use ($wantsApi) {
            if (! $wantsApi($request)) {
                return null;
            }
            $errors = [];
            foreach ($e->errors() as $field => $messages) {
                $errors[$field] = $messages[0];
            }

            return response()->json([
                'success' => false,
                'message' => 'Please correct the highlighted fields.',
                'errors' => $errors,
            ], 422);
        });

        $exceptions->render(function (ApiException $e, Request $request) use ($wantsApi) {
            if (! $wantsApi($request)) {
                return null;
            }

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
                'errors' => $e->errors,
            ], $e->status);
        });

        // A rate limit was hit. Say how long to wait, and pass Retry-After on -
        // the generic handler below builds a fresh response and would drop it.
        $exceptions->render(function (ThrottleRequestsException $e, Request $request) use ($wantsApi) {
            if (! $wantsApi($request)) {
                return null;
            }

            $headers = $e->getHeaders();
            $seconds = max(1, (int) ($headers['Retry-After'] ?? 60));
            $minutes = (int) ceil($seconds / 60);

            return response()->json([
                'success' => false,
                'message' => 'Too many attempts. Please wait '.$minutes.' minute'.($minutes === 1 ? '' : 's').' and try again.',
                'retryAfter' => $seconds,
            ], 429, $headers);
        });

        $exceptions->render(function (\Throwable $e, Request $request) use ($wantsApi) {
            if (! $wantsApi($request)) {
                return null;
            }

            $status = 500;
            if (method_exists($e, 'getStatusCode')) {
                $status = $e->getStatusCode();
            }

            if ($status >= 500) {
                report($e);
                return response()->json([
                    'success' => false,
                    'message' => 'Something went wrong on our side.',
                ], 500);
            }

            return response()->json([
                'success' => false,
                'message' => $e->getMessage() ?: 'Request failed.',
            ], $status);
        });
    })->create();
