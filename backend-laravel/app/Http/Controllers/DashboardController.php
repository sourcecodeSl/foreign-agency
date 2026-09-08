<?php

namespace App\Http\Controllers;

use App\Models\Agency;
use App\Models\EmailVerification;
use App\Models\User;
use App\Support\ApiResponse;

class DashboardController extends Controller
{
    /** GET /dashboard/stats - counters behind the four overview cards. */
    public function stats()
    {
        return ApiResponse::ok([
            'agencies' => ['total' => Agency::count(), 'delta' => '+12%'],
            'pending' => ['total' => Agency::where('status', 'pending')->count(), 'delta' => '+2'],
            'users' => ['total' => User::count(), 'delta' => '+8%'],
            'unverified' => ['total' => EmailVerification::where('status', '!=', 'verified')->count(), 'delta' => '-3'],
        ]);
    }

    /** GET /dashboard/activity - most recent audit entries. */
    public function activity()
    {
        return ApiResponse::ok([
            ['id' => 1, 'actor' => 'Ishara Bandara', 'action' => 'approved agency', 'target' => 'Skyline Marketing', 'at' => '2026-09-07 09:20'],
            ['id' => 2, 'actor' => 'Ishara Bandara', 'action' => 'created agency', 'target' => 'Lotus Consulting', 'at' => '2026-09-05 15:40'],
            ['id' => 3, 'actor' => 'System', 'action' => 'sent verification email', 'target' => 'admin@lotus.lk', 'at' => '2026-09-05 15:41'],
        ]);
    }
}
