<?php

use App\Http\Controllers\AgencyController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\RoleController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\VerificationController;
use Illuminate\Support\Facades\Route;

/*
| All routes are served under the /api/v1 prefix (see bootstrap/app.php).
| Mirrors the Express router tree in backend/src/routes.
*/

// --- Auth -------------------------------------------------------------------
Route::prefix('auth')->group(function () {
    Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:10,60');
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:10,15');
    Route::post('/verify-otp', [AuthController::class, 'verifyOtp'])->middleware('throttle:12,15');
    Route::post('/verify-email', [AuthController::class, 'verifyEmail'])->middleware('throttle:12,15');
    Route::post('/resend-otp', [AuthController::class, 'resendOtp'])->middleware('throttle:12,15');
    Route::get('/me', [AuthController::class, 'me'])->middleware('auth.jwt');
    Route::post('/logout', [AuthController::class, 'logout'])->middleware('auth.jwt');
});

// --- Verification: public confirmation link ---------------------------------
Route::get('/verification/emails/confirm/{token}', [VerificationController::class, 'confirmByToken']);

// --- Agencies ---------------------------------------------------------------
Route::prefix('agencies')->middleware('auth.jwt')->group(function () {
    Route::get('/', [AgencyController::class, 'index'])->middleware('can.perm:agencies,view');
    Route::get('/counts', [AgencyController::class, 'counts'])->middleware('can.perm:agencies,view');
    Route::get('/{id}', [AgencyController::class, 'show'])->middleware('can.perm:agencies,view');
    Route::post('/', [AgencyController::class, 'store'])->middleware('can.perm:agencies,create');
    Route::put('/{id}', [AgencyController::class, 'update'])->middleware('can.perm:agencies,edit');
    Route::patch('/{id}/status', [AgencyController::class, 'updateStatus'])->middleware('can.perm:agencies,edit');
    Route::post('/{id}/credentials/reset', [AgencyController::class, 'resetCredentials'])->middleware('can.perm:agencies,edit');
    Route::delete('/{id}', [AgencyController::class, 'destroy'])->middleware('can.perm:agencies,delete');
});

// --- Users ------------------------------------------------------------------
Route::prefix('users')->middleware('auth.jwt')->group(function () {
    Route::get('/', [UserController::class, 'index'])->middleware('can.perm:users,view');
    Route::get('/{id}', [UserController::class, 'show'])->middleware('can.perm:users,view');
    Route::post('/', [UserController::class, 'store'])->middleware('can.perm:users,create');
    Route::put('/{id}', [UserController::class, 'update'])->middleware('can.perm:users,edit');
    Route::patch('/{id}/status', [UserController::class, 'updateStatus'])->middleware('can.perm:users,edit');
    Route::delete('/{id}', [UserController::class, 'destroy'])->middleware('can.perm:users,delete');
});

// --- Roles & permissions ----------------------------------------------------
Route::prefix('roles')->middleware('auth.jwt')->group(function () {
    Route::get('/', [RoleController::class, 'index'])->middleware('can.perm:roles,view');
    Route::post('/', [RoleController::class, 'store'])->middleware('can.perm:roles,create');
    Route::put('/{id}', [RoleController::class, 'update'])->middleware('can.perm:roles,edit');
    Route::delete('/{id}', [RoleController::class, 'destroy'])->middleware('can.perm:roles,delete');
    Route::get('/{slug}/permissions', [RoleController::class, 'getPermissions'])->middleware('can.perm:roles,view');
    Route::put('/{slug}/permissions', [RoleController::class, 'savePermissions'])->middleware('can.perm:roles,edit');
});

// --- Verification (authenticated) -------------------------------------------
Route::prefix('verification')->middleware('auth.jwt')->group(function () {
    Route::get('/emails', [VerificationController::class, 'listEmails']);
    Route::post('/emails', [VerificationController::class, 'requestEmail']);
    Route::post('/emails/{id}/resend', [VerificationController::class, 'resendEmail']);
    Route::patch('/emails/{id}/verify', [VerificationController::class, 'markVerified']);
});

// --- Dashboard --------------------------------------------------------------
Route::prefix('dashboard')->middleware('auth.jwt')->group(function () {
    Route::get('/stats', [DashboardController::class, 'stats']);
    Route::get('/activity', [DashboardController::class, 'activity']);
});
