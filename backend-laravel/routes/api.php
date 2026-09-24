<?php

use App\Http\Controllers\AgencyController;
use App\Http\Controllers\AgreementController;
use App\Http\Controllers\AppearanceController;
use App\Http\Controllers\AgencyProfileController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\CandidateController;
use App\Http\Controllers\CandidateDocumentController;
use App\Http\Controllers\CoordinatorController;
use App\Http\Controllers\CountryController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\EmployerAgreementController;
use App\Http\Controllers\ForeignCompanyController;
use App\Http\Controllers\JobRoleController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\PasswordResetController;
use App\Http\Controllers\RoleController;
use App\Http\Controllers\SystemUpdateController;
use App\Http\Controllers\SkillTestController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\VerificationController;
use Illuminate\Support\Facades\Route;

/*
| All routes are served under the /api/v1 prefix (see bootstrap/app.php).
| Mirrors the Express router tree in backend/src/routes.
*/

// --- Auth -------------------------------------------------------------------
// /auth/register files an application only: an agency's own details, with no
// login. The Main Admin is seeded, and every agency login is still issued from
// the admin panel - on approving the application, or on creating the agency.
// Each throttled route keeps its own count (the third throttle argument),
// so one sign-in - login, phone code, email code - never uses up another
// step's limit.
Route::prefix('auth')->group(function () {
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:10,15,login');
    Route::post('/verify-otp', [AuthController::class, 'verifyOtp'])->middleware('throttle:12,15,verify-otp');
    Route::post('/verify-email', [AuthController::class, 'verifyEmail'])->middleware('throttle:12,15,verify-email');
    Route::post('/resend-otp', [AuthController::class, 'resendOtp'])->middleware('throttle:12,15,resend-otp');
    // An agency applies for itself: details only, no login until the
    // administrator approves it.
    Route::post('/register', [AgencyController::class, 'register'])->middleware('throttle:5,60,register');
    Route::get('/me', [AuthController::class, 'me'])->middleware('auth.jwt');
    Route::post('/logout', [AuthController::class, 'logout'])->middleware('auth.jwt');

    // Forgotten password: username -> code emailed to the account -> new password.
    Route::post('/forgot-password', [PasswordResetController::class, 'start'])->middleware('throttle:10,15,forgot-password');
    Route::post('/forgot-password/resend', [PasswordResetController::class, 'resend'])->middleware('throttle:12,15,forgot-resend');
    Route::post('/forgot-password/verify', [PasswordResetController::class, 'verify'])->middleware('throttle:12,15,forgot-verify');
    Route::post('/forgot-password/reset', [PasswordResetController::class, 'reset'])->middleware('throttle:12,15,forgot-reset');
});

// --- Database update from a browser -----------------------------------------
// For a live server where php artisan cannot be run. Off unless MIGRATE_KEY is
// set in .env; the key is typed into the page, and each try is limited.
Route::get('/system/update', [SystemUpdateController::class, 'show']);
Route::post('/system/update', [SystemUpdateController::class, 'handle'])->middleware('throttle:5,1,system-update');

// --- The signed-in person's own appearance ----------------------------------
// Every role has one; each login reads and changes only its own.
Route::prefix('account')->middleware('auth.jwt')->group(function () {
    Route::get('/appearance', [AppearanceController::class, 'show']);
    Route::put('/appearance', [AppearanceController::class, 'update']);
});

// --- Countries --------------------------------------------------------------
// Read by anybody: an agency registering itself picks its country before it
// has a login. Only the Main Admin and coordinators change the list, which
// the controller checks.
Route::get('/countries', [CountryController::class, 'index']);
Route::middleware('auth.jwt')->group(function () {
    Route::post('/countries', [CountryController::class, 'store']);
    Route::delete('/countries/{id}', [CountryController::class, 'destroy']);
});

// --- Verification: public confirmation link ---------------------------------
Route::get('/verification/emails/confirm/{token}', [VerificationController::class, 'confirmByToken']);

// --- Agencies ---------------------------------------------------------------
Route::prefix('agencies')->middleware('auth.jwt')->group(function () {
    // The foreign companies a candidate may be registered for. Outside the
    // permission matrix: a local agency registering a candidate picks one.
    Route::get('/foreign-options', [AgencyController::class, 'foreignOptions']);
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
    // The signature and the seal, added on the edit screen alone.
    Route::post('/marks', [AgencyProfileController::class, 'uploadMark']);
    Route::get('/marks/{type}', [AgencyProfileController::class, 'showMark']);
    Route::delete('/marks/{type}', [AgencyProfileController::class, 'deleteMark']);
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
    // The agency's own switch: passing opens the file for documents and ties
    // the person to that agency.
    Route::patch('/{id}/pass', [CandidateController::class, 'pass'])->middleware('can.perm:candidates,edit');
    // How the test went, recorded by the foreign company or the admin side.
    Route::patch('/{id}/test-result', [CandidateController::class, 'testResult']);
    // Once passed, the same person's registrations for other companies can be
    // blocked by the company holding the pass, or by the admin side.
    Route::patch('/{id}/other-registrations/{otherId}', [CandidateController::class, 'blockRegistration']);
    // The foreign companies one candidate is put up with, each for its own
    // job categories. Added by the owning agency until the candidate passes.
    Route::post('/{id}/registrations', [CandidateController::class, 'addRegistration'])->middleware('can.perm:candidates,edit');
    Route::put('/{id}/registrations/{registrationId}', [CandidateController::class, 'updateRegistration'])->middleware('can.perm:candidates,edit');
    Route::delete('/{id}/registrations/{registrationId}', [CandidateController::class, 'removeRegistration'])->middleware('can.perm:candidates,edit');
    // Applied / received, with the reference number and the date issued.
    Route::patch('/{id}/police-report', [CandidateController::class, 'policeReport'])->middleware('can.perm:candidates,edit');
    // Submitting the profile is a coordinator's call (or the Main Admin's),
    // checked in the controller; an agency never submits.
    Route::patch('/{id}/status', [CandidateController::class, 'updateStatus'])->middleware('can.page:candidates');
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

// --- Coordinators -----------------------------------------------------------
// People the Main Admin adds to help run the system, each opened to the pages
// they need. Main Admin only, checked in the controller.
Route::prefix('coordinators')->middleware('auth.jwt')->group(function () {
    Route::get('/', [CoordinatorController::class, 'index']);
    Route::post('/', [CoordinatorController::class, 'store']);
    Route::put('/{id}', [CoordinatorController::class, 'update']);
    Route::patch('/{id}/status', [CoordinatorController::class, 'updateStatus']);
    Route::post('/{id}/password', [CoordinatorController::class, 'resetPassword']);
    Route::delete('/{id}', [CoordinatorController::class, 'destroy']);
});

// --- Foreign companies ------------------------------------------------------
// Each company belongs to the coordinator (foreign agent) who brought it in;
// the Main Admin sees every one. can.page holds a coordinator to the pages
// opened to them; the controller keeps agency logins out altogether.
// The active companies, by name: a candidate is registered for one of them,
// so an agency registering a candidate reads this list too.
Route::get('/companies/options', [ForeignCompanyController::class, 'options'])->middleware('auth.jwt');

Route::middleware(['auth.jwt', 'can.page:companies'])->group(function () {
    Route::prefix('companies')->group(function () {
        // Everyone registered for this company's test, however it went.
        Route::get('/{id}/registered-candidates', [ForeignCompanyController::class, 'registeredCandidates']);
        Route::get('/', [ForeignCompanyController::class, 'index']);
        Route::post('/', [ForeignCompanyController::class, 'store']);
        Route::get('/{id}', [ForeignCompanyController::class, 'show']);
        Route::put('/{id}', [ForeignCompanyController::class, 'update']);
        Route::patch('/{id}/status', [ForeignCompanyController::class, 'updateStatus']);
        // Only candidates who passed a test here - passing locks them to one company.
        Route::get('/{id}/candidates', [ForeignCompanyController::class, 'candidates']);
    });
});

// --- Skill tests ------------------------------------------------------------
// An agency reads the attempts made on its own candidates; the Main Admin and
// coordinators book them and record the result.
Route::get('/job-roles', [JobRoleController::class, 'index'])->middleware('auth.jwt');

// The job categories on the registration screen: the Main Admin and
// coordinators add and remove them; the controller keeps agencies out.
Route::middleware(['auth.jwt', 'can.page:candidates'])->group(function () {
    Route::post('/job-roles', [JobRoleController::class, 'store']);
    Route::delete('/job-roles/{id}', [JobRoleController::class, 'destroy']);
});

Route::prefix('tests')->middleware('auth.jwt')->group(function () {
    Route::get('/', [SkillTestController::class, 'index']);
    Route::post('/', [SkillTestController::class, 'store'])->middleware('can.page:companies');
    Route::patch('/{id}/result', [SkillTestController::class, 'result'])->middleware('can.page:companies');
});

// --- Agreements --------------------------------------------------------------
// The Main Admin, a coordinator the page is opened to, and foreign companies
// upload agreement PDFs and fill them in English, Hebrew and Sinhala; local
// agencies read the ones passed to them. can.page holds the coordinator to
// the page; the controller sorts out everyone else.
Route::middleware(['auth.jwt', 'can.page:agreements'])->group(function () {
    Route::get('/agreement-templates', [AgreementController::class, 'templates']);
    Route::post('/agreement-templates', [AgreementController::class, 'uploadTemplate']);
    Route::get('/agreement-templates/{id}/file', [AgreementController::class, 'templateFile']);
    Route::delete('/agreement-templates/{id}', [AgreementController::class, 'deleteTemplate']);

    // Before /agreements/{id}, so "translate" is never read as an id.
    Route::post('/agreements/translate', [AgreementController::class, 'translate'])->middleware('throttle:60,1,translate');
    Route::get('/agreements/recipients', [AgreementController::class, 'recipients']);
    Route::post('/agreements/employer-localise', [AgreementController::class, 'localiseEmployer'])->middleware('throttle:60,1,translate');
    Route::get('/agreements', [AgreementController::class, 'index']);
    Route::post('/agreements', [AgreementController::class, 'store']);
    Route::get('/agreements/{id}', [AgreementController::class, 'show']);
    Route::get('/agreements/{id}/file', [AgreementController::class, 'file']);
    // A foreign company sends its agreement to the admin side, which passes
    // it to one local agency - only then does that agency see it.
    // The company's name, salary, seal and signature stay its to change, even once sent.
    Route::patch('/agreements/{id}/details', [AgreementController::class, 'details']);
    Route::put('/agreements/{id}/salary', [AgreementController::class, 'details']);
    // The company seal and the signature, printed at the foot of every page.
    Route::post('/agreements/{id}/marks', [AgreementController::class, 'uploadMark']);
    Route::get('/agreements/{id}/marks/{type}', [AgreementController::class, 'mark']);
    Route::post('/agreements/{id}/send-to-admin', [AgreementController::class, 'sendToAdmin']);
    Route::post('/agreements/{id}/send-to-agency', [AgreementController::class, 'sendToAgency']);
    // The local agency puts one of its candidates on it: passed ones first.
    Route::get('/agreements/{id}/candidates', [AgreementController::class, 'candidates']);
    Route::post('/agreements/{id}/assign', [AgreementController::class, 'assign']);
    Route::put('/agreements/{id}', [AgreementController::class, 'update']);
    Route::delete('/agreements/{id}', [AgreementController::class, 'destroy']);
});

// The employer part of the agreement, submitted by a foreign company from its
// own login; the Main Admin and coordinators with the page read what came in.
// can.page holds only coordinators, so agency logins pass it; the controller
// keeps everyone but foreign companies from submitting.
Route::middleware(['auth.jwt', 'can.page:agreements'])->group(function () {
    Route::get('/employer-agreement/draft', [EmployerAgreementController::class, 'draft']);
    Route::post('/employer-agreement', [EmployerAgreementController::class, 'store']);
    Route::get('/employer-agreements', [EmployerAgreementController::class, 'index']);
});

// --- Verification (authenticated) -------------------------------------------
Route::prefix('verification')->middleware(['auth.jwt', 'can.page:verification'])->group(function () {
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
Route::prefix('dashboard')->middleware(['auth.jwt', 'can.page:dashboard'])->group(function () {
    Route::get('/stats', [DashboardController::class, 'stats']);
    Route::get('/activity', [DashboardController::class, 'activity']);
});

// --- Notifications (the bell in the top bar) --------------------------------
// Every signed-in role has one; the controller scopes what each role sees.
Route::get('/notifications', [NotificationController::class, 'index'])->middleware('auth.jwt');
// Opening one takes it off the bell for this login, on every device.
Route::post('/notifications/{id}/dismiss', [NotificationController::class, 'dismiss'])->middleware('auth.jwt');
