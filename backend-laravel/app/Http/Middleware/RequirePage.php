<?php

namespace App\Http\Middleware;

use App\Exceptions\ApiException;
use App\Support\PageAccess;
use Closure;
use Illuminate\Http\Request;

/**
 * Route guard for screens that sit outside the permission matrix.
 *
 *   Route::prefix('dashboard')->middleware(['auth.jwt', 'can.page:dashboard'])
 *
 * Only a coordinator is held to it: they reach a page once the Main Admin has
 * opened it to them. Every other role passes straight through and is checked
 * exactly as it was before.
 */
class RequirePage
{
    public function handle(Request $request, Closure $next, string $page)
    {
        $auth = $request->attributes->get('auth_user');

        if (($auth['roleSlug'] ?? null) === PageAccess::ROLE) {
            $account = $request->attributes->get('auth_account');

            if (! $account || ! in_array($page, $account->pageAccess(), true)) {
                throw new ApiException(403, PageAccess::REFUSAL);
            }
        }

        return $next($request);
    }
}
