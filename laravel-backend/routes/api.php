<?php

use App\Http\Controllers\Api\Admin\AgencyController;
use App\Http\Controllers\Api\Agency\CandidateController;
use App\Http\Controllers\Api\Agency\CandidateDocumentController;
use App\Http\Controllers\Api\Auth\AuthController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API routes  (prefix: /api)
|--------------------------------------------------------------------------
|
| RBAC is enforced by the `role` middleware, which keeps the Main Admin and
| Agency surfaces completely separate:
|
|   /admin/*    role:main_admin
|   /agency/*   role:agency          (Main Admin may also read candidates)
|
*/

Route::prefix('auth')->group(function () {
    // Public: the three sign-in steps.
    Route::post('login', [AuthController::class, 'login'])->middleware('throttle:10,1');
    Route::post('verify-phone', [AuthController::class, 'verifyPhone'])->middleware('throttle:12,1');
    Route::post('verify-email', [AuthController::class, 'verifyEmail'])->middleware('throttle:12,1');
    Route::post('resend-otp', [AuthController::class, 'resend'])->middleware('throttle:12,1');

    Route::middleware('auth:sanctum')->group(function () {
        Route::get('me', [AuthController::class, 'me']);
        Route::post('logout', [AuthController::class, 'logout']);
    });
});

/*
| Main Admin - creates and manages agencies and their login credentials.
*/
Route::middleware(['auth:sanctum', 'role:main_admin'])->prefix('admin')->group(function () {
    Route::get('agencies/counts', [AgencyController::class, 'counts']);
    Route::post('agencies/{agency}/status', [AgencyController::class, 'updateStatus']);
    Route::post('agencies/{agency}/credentials/reset', [AgencyController::class, 'resetCredentials']);
    Route::apiResource('agencies', AgencyController::class);
});

/*
| Agency - candidate registration and document uploads.
| Main Admin is allowed in as well so it can review candidates across agencies;
| the controllers scope every query by role.
*/
Route::middleware(['auth:sanctum', 'role:agency,main_admin'])->prefix('agency')->group(function () {
    Route::get('document-types', [CandidateController::class, 'documentTypes']);

    Route::post('candidates/{candidate}/status', [CandidateController::class, 'updateStatus']);
    Route::apiResource('candidates', CandidateController::class);

    // Documents attached to one candidate.
    Route::prefix('candidates/{candidate}/documents')->group(function () {
        Route::get('/', [CandidateDocumentController::class, 'index']);
        Route::post('/', [CandidateDocumentController::class, 'store']);
        Route::post('bulk', [CandidateDocumentController::class, 'storeMany']);
        Route::get('{document}/download', [CandidateDocumentController::class, 'download']);
        Route::delete('{document}', [CandidateDocumentController::class, 'destroy']);
    });
});
