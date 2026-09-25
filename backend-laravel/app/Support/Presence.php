<?php

namespace App\Support;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

/**
 * Online and "last seen", read from users.last_seen_at.
 *
 * Every signed-in request moves it on (RequireAuth), and every open screen
 * asks the server something at least once a minute (the bell), so somebody
 * with the system open in front of them counts as online.
 */
final class Presence
{
    /** How recent last_seen_at has to be to count as online. */
    public const ONLINE_SECONDS = 90;

    /** last_seen_at is written at most this often per login. */
    public const TOUCH_SECONDS = 30;

    public static function touch(User $user): void
    {
        $last = $user->last_seen_at ? Carbon::parse($user->last_seen_at) : null;

        if ($last && $last->gt(now()->subSeconds(self::TOUCH_SECONDS))) {
            return;
        }

        // Straight to the table, so updated_at on the user stays what it was.
        // A live server that has the code before its database update is
        // still let in; it only goes without presence until then.
        try {
            DB::table('users')->where('id', $user->id)->update(['last_seen_at' => now()]);
        } catch (QueryException) {
            // last_seen_at does not exist yet.
        }
    }

    /** { online, lastSeenAt } for whoever was seen most recently of these logins. */
    public static function of(?string $lastSeen): array
    {
        $at = $lastSeen ? Carbon::parse($lastSeen) : null;

        return [
            'online' => $at !== null && $at->gt(now()->subSeconds(self::ONLINE_SECONDS)),
            'lastSeenAt' => $at?->toIso8601String(),
        ];
    }

    /** The admin side is online when the Main Admin or any coordinator is. */
    public static function adminSide(): array
    {
        return self::of(User::whereIn('role_slug', ['main_admin', PageAccess::ROLE])
            ->where('status', 'active')
            ->max('last_seen_at'));
    }

    /** Last seen of each agency: the most recent of its logins, keyed by agency id. */
    public static function agencies(): array
    {
        return User::whereNotNull('agency_id')
            ->groupBy('agency_id')
            ->selectRaw('agency_id, MAX(last_seen_at) as seen')
            ->pluck('seen', 'agency_id')
            ->all();
    }
}
