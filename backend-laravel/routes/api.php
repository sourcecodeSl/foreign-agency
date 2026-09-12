<?php

use App\Http\Controllers\AgencyController;
use App\Http\Controllers\AgencyProfileController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\CandidateController;
use App\Http\Controllers\CandidateDocumentController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\PasswordResetController;
use App\Http\Controllers\RoleController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\VerificationController;
use Illuminate\Support\Facades\Route;

/*
| All routes are served under the /api/v1 prefix (see bootstrap/app.php).
| Mirrors the Express router tree in backend/src/routes.
*/

// --- Auth -------------------------------------------------------------------
// There is deliberately no /auth/register: accounts are never self-created.
// The Main Admin is seeded, and agency logins are issued from the admin panel.
// Each throttled route keeps its own count (the third throttle argument),
// so one sign-in - login, phone code, email code - never uses up another
// step's limit.
Route::prefix('auth')->group(function () {
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:10,15,login');
    Route::post('/verify-otp', [AuthController::class, 'verifyOtp'])->middleware('throttle:12,15,verify-otp');
    Route::post('/verify-email', [AuthController::class, 'verifyEmail'])->middleware('throttle:12,15,verify-email');
    Route::post('/resend-otp', [AuthController::class, 'resendOtp'])->middleware('throttle:12,15,resend-otp');
    Route::get('/me', [AuthController::class, 'me'])->middleware('auth.jwt');
    Route::post('/logout', [AuthController::class, 'logout'])->middleware('auth.jwt');

    // Forgotten password: username -> code emailed to the account -> new password.
    Route::post('/forgot-password', [PasswordResetController::class, 'start'])->middleware('throttle:10,15,forgot-password');
    Route::post('/forgot-password/resend', [PasswordResetController::class, 'resend'])->middleware('throttle:12,15,forgot-resend');
    Route::post('/forgot-password/verify', [PasswordResetController::class, 'verify'])->middleware('throttle:12,15,forgot-verify');
    Route::post('/forgot-password/reset', [PasswordResetController::class, 'reset'])->middleware('throttle:12,15,forgot-reset');
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

// --- The signed-in agency's own details -------------------------------------
// Outside the permission matrix: the controller lets only the agency owner in,
// and only ever at its own agency.
Route::prefix('agency-profile')->middleware('auth.jwt')->group(function () {
    Route::get('/', [AgencyProfileController::class, 'show']);
    Route::put('/', [AgencyProfileController::class, 'update']);
    // A new phone or email is saved only once the code sent to it comes back.
    Route::post('/contact', [AgencyProfileController::class, 'requestContactChange'])->middleware('throttle:10,15,contact-change');
    Route::post('/contact/resend', [AgencyProfileController::class, 'resendContactCode'])->middleware('throttle:12,15,contact-resend');
    Route::post('/contact/verify', [AgencyProfileController::class, 'verifyContactChange'])->middleware('throttle:12,15,contact-verify');
});

// --- Candidates (registered by an agency; no OTP anywhere in this flow) -----
Route::prefix('candidates')->middleware('auth.jwt')->group(function () {
    // The eight required documents, so the UI never hard-codes the list.
    Route::get('/document-types', [CandidateController::class, 'documentTypes']);

    Route::get('/', [CandidateController::class, 'index'])->middleware('can.perm:candidates,view');
    Route::post('/', [CandidateController::class, 'store'])->middleware('can.perm:candidates,create');
    Route::get('/{id}', [CandidateController::class, 'show'])->middleware('can.perm:candidates,view');
    Route::put('/{id}', [CandidateController::class, 'update'])->middleware('can.perm:candidates,edit');
    Route::patch('/{id}/status', [CandidateController::class, 'updateStatus'])->middleware('can.perm:candidates,edit');
    Route::delete('/{id}', [CandidateController::class, 'destroy'])->middleware('can.perm:candidates,delete');

    // Documents attached to one candidate. Uploads are append-only and there
    // is deliberately no delete route - an attached document cannot be removed.
    Route::get('/{id}/documents', [CandidateDocumentController::class, 'index'])->middleware('can.perm:candidates,view');
    Route::post('/{id}/documents', [CandidateDocumentController::class, 'store'])->middleware('can.perm:candidates,edit');
    Route::post('/{id}/documents/bulk', [CandidateDocumentController::class, 'storeMany'])->middleware('can.perm:candidates,edit');
    // Every version ever uploaded for one type.
    Route::get('/{id}/documents/history/{type}', [CandidateDocumentController::class, 'history'])->middleware('can.perm:candidates,view');
    // All types zipped, one folder each holding the latest file.
    Route::get('/{id}/documents/download-all', [CandidateDocumentController::class, 'downloadAll'])->middleware('can.perm:candidates,view');
    Route::get('/{id}/documents/{documentId}/download', [CandidateDocumentController::class, 'download'])->middleware('can.perm:candidates,view');
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
    // How far each agency's owner login has got: approved, phone, email,
    // first sign-in. Administrator and auditor only, checked in the controller.
    Route::get('/agencies', [VerificationController::class, 'agencies']);

    Route::get('/emails', [VerificationController::class, 'listEmails']);
    Route::post('/emails', [VerificationController::class, 'requestEmail']);
    Route::post('/emails/{id}/resend', [VerificationController::class, 'resendEmail']);
    Route::patch('/emails/{id}/verify', [VerificationController::class, 'markVerified']);
    // Administrator only; the check lives in the controller because this group
    // is not behind the permission matrix.
    Route::delete('/emails/{id}', [VerificationController::class, 'destroy']);
});

// --- Dashboard --------------------------------------------------------------
Route::prefix('dashboard')->middleware('auth.jwt')->group(function () {
    Route::get('/stats', [DashboardController::class, 'stats']);
    Route::get('/activity', [DashboardController::class, 'activity']);
});

// --- Notifications (the bell in the top bar) --------------------------------
// Every signed-in role has one; the controller scopes what each role sees.
Route::get('/notifications', [NotificationController::class, 'index'])->middleware('auth.jwt');
