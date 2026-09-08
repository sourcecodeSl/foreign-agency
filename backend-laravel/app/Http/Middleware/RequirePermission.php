<?php

namespace App\Http\Middleware;

use App\Exceptions\ApiException;
use App\Models\Role;
use Closure;
use Illuminate\Http\Request;

/**
 * Route guard for the permission matrix, ported from
 * middleware/requirePermission.js.
 *
 *   Route::post(...)->middleware('can.perm:agencies,create');
 *
 * Main Admin always passes; every other role is checked against the saved
 * matrix for its slug.
 */
class RequirePermission
{
    public function handle(Request $request, Closure $next, string $moduleKey, string $action)
    {
        $auth = $request->attributes->get('auth_user');
        $roleSlug = $auth['roleSlug'] ?? null;

        if (! $roleSlug) {
            throw new ApiException(401, 'Authentication required.');
        }
        if ($roleSlug === 'main_admin') {
            return $next($request);
        }

        $role = Role::where('slug', $roleSlug)->first();
        $matrix = $role?->permissions ?? [];
        $allowed = $matrix[$moduleKey][$action] ?? false;

        if (! $allowed) {
            throw new ApiException(403, 'You do not have permission to '.$action.' '.$moduleKey.'.');
        }

        return $next($request);
    }
}
