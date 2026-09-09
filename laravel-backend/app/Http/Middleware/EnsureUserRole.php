<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Role gate for the route groups.
 *
 *   Route::middleware('role:main_admin')        -> Main Admin only
 *   Route::middleware('role:agency')            -> agency logins only
 *   Route::middleware('role:main_admin,agency') -> either
 */
class EnsureUserRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json([
                'success' => false,
                'message' => 'Authentication required.',
            ], 401);
        }

        if (! $user->isActive()) {
            return response()->json([
                'success' => false,
                'message' => 'This account is not active.',
            ], 403);
        }

        if (! in_array($user->role->value, $roles, true)) {
            return response()->json([
                'success' => false,
                'message' => 'You do not have access to this resource.',
            ], 403);
        }

        // An agency login is useless if the agency itself was deactivated.
        if ($user->isAgency() && ! $user->agency?->isActive()) {
            return response()->json([
                'success' => false,
                'message' => 'This agency is not active.',
            ], 403);
        }

        return $next($request);
    }
}
