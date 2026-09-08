<?php

namespace App\Http\Middleware;

use App\Exceptions\ApiException;
use App\Support\Jwt;
use Closure;
use Illuminate\Http\Request;

/**
 * Reads the bearer token, verifies it and attaches the payload to the request
 * as `auth_user`. Ported from middleware/requireAuth.js.
 */
class RequireAuth
{
    public function handle(Request $request, Closure $next)
    {
        $header = $request->header('Authorization', '');
        $token = str_starts_with($header, 'Bearer ')
            ? substr($header, 7)
            : $request->cookie('token');

        if (! $token) {
            throw new ApiException(401, 'Authentication required.');
        }

        $payload = Jwt::verify($token);
        if (! $payload) {
            throw new ApiException(401, 'Invalid session token.');
        }

        $request->attributes->set('auth_user', $payload);

        return $next($request);
    }
}
