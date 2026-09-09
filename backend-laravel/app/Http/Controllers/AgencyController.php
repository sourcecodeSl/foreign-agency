<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Models\Agency;
use App\Models\AppCounter;
use App\Models\User;
use App\Support\ApiResponse;
use App\Support\Credentials;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class AgencyController extends Controller
{
    private function loginUrl(): string
    {
        return rtrim((string) (env('CLIENT_URL') ?: env('APP_URL') ?: ''), '/').'/agency/login';
    }

    /** GET /agencies?status=&search= */
    /** Roles that legitimately see every agency. */
    private const GLOBAL_ROLES = ['main_admin', 'auditor'];

    /** Approving, resetting credentials and deleting stay with the admin. */
    private function requireGlobalRole(Request $request): void
    {
        $auth = $request->attributes->get('auth_user');

        if (! in_array($auth['roleSlug'] ?? null, self::GLOBAL_ROLES, true)) {
            throw new ApiException(403, 'Only the administrator can do this.');
        }
    }

    /** Null for those roles, the caller's own agency id otherwise. */
    private function scopeAgencyId(Request $request): ?string
    {
        $auth = $request->attributes->get('auth_user');

        if (in_array($auth['roleSlug'] ?? null, self::GLOBAL_ROLES, true)) {
            return null;
        }

        return $auth['agencyId'] ?? '';
    }

    public function index(Request $request)
    {
        $status = $request->query('status', 'all');
        $search = trim((string) $request->query('search', ''));

        $query = Agency::query();

        // An agency must never see the other agencies on the platform - the
        // listing carries their names, addresses and login usernames.
        $scope = $this->scopeAgencyId($request);
        if ($scope !== null) {
            $query->where('id', $scope);
        }

        if ($status !== 'all') {
            $query->where('status', $status);
        }
        if ($search !== '') {
            $term = '%'.$search.'%';
            $query->where(function ($q) use ($term) {
                $q->where('name', 'like', $term)
                    ->orWhere('username', 'like', $term)
                    ->orWhere('code', 'like', $term);
            });
        }

        $rows = $query->get()->map(fn (Agency $a) => $a->toPublic())->values();

        return ApiResponse::ok($rows);
    }

    /** GET /agencies/counts */
    public function counts(Request $request)
    {
        $scope = $this->scopeAgencyId($request);
        $base = fn () => $scope === null ? Agency::query() : Agency::where('id', $scope);

        return ApiResponse::ok([
            'all' => $base()->count(),
            'pending' => $base()->where('status', 'pending')->count(),
            'active' => $base()->where('status', 'active')->count(),
            'deactivated' => $base()->where('status', 'deactivated')->count(),
        ]);
    }

    /** GET /agencies/:id */
    public function show(Request $request, string $id)
    {
        $agency = Agency::find($id);
        if (! $agency) {
            throw new ApiException(404, 'Agency not found.');
        }

        $scope = $this->scopeAgencyId($request);
        if ($scope !== null && $agency->id !== $scope) {
            throw new ApiException(403, 'You can only view your own agency.');
        }

        return ApiResponse::ok($agency->toPublic());
    }

    /** POST /agencies */
    public function store(Request $request)
    {
        $data = $request->all();
        Validator::make($data, [
            'name' => 'required|string|min:3',
            'address' => 'required|string|min:8',
            'username' => ['required', 'regex:/^[a-zA-Z0-9._-]{4,20}$/'],
            'password' => ['required', 'string', 'min:8', 'regex:/[A-Z]/', 'regex:/[0-9]/'],
            // Sign-in sends a code to the phone and then to the email, so an
            // agency cannot be usable without both.
            'email' => ['required', 'email', 'max:190'],
            'phone' => ['required', 'string', 'regex:/^[0-9+\s-]{9,20}$/'],
        ], [
            'email.required' => 'An email address is required for sign-in codes.',
            'phone.required' => 'A phone number is required for sign-in codes.',
            'phone.regex' => 'Enter a valid phone number.',
            'name.min' => 'Name must be at least 3 characters.',
            'address.min' => 'Please provide the full address.',
            'username.regex' => 'Username must be 4-20 characters (letters, numbers, . _ -).',
            'password.min' => 'Password must be at least 8 characters.',
            'password.regex' => 'Password must include an uppercase letter and a number.',
        ])->validate();

        $conflicts = [];
        if (Agency::where('username', $data['username'])->exists()
            || User::where('username', $data['username'])->exists()) {
            $conflicts['username'] = 'That username is already taken.';
        }
        if (User::emailExists($data['email'])) {
            $conflicts['email'] = 'That email is already in use.';
        }
        if (User::phoneExists($data['phone'])) {
            $conflicts['phone'] = 'That phone number is already in use.';
        }
        if ($conflicts) {
            throw new ApiException(409, 'These credentials are already in use.', $conflicts);
        }

        $auth = $request->attributes->get('auth_user');
        $sequence = AppCounter::next('agency');
        $plainPassword = $data['password'] ?: Credentials::generatePassword();

        $agency = DB::transaction(function () use ($data, $sequence, $plainPassword, $auth) {
            $agency = Agency::create([
                'id' => 'AG-'.$sequence,
                'name' => $data['name'],
                'code' => Credentials::generateAgencyCode($data['name'], $sequence),
                'address' => $data['address'],
                'username' => $data['username'],
                'password_hash' => password_hash($plainPassword, PASSWORD_BCRYPT),
                'contact' => $data['contact'] ?? '-',
                'email' => $data['email'],
                'users' => 1,
                'status' => 'pending',
                'created_at' => now()->format('Y-m-d'),
                'created_by' => $auth['sub'] ?? null,
            ]);

            // The login the agency owner actually signs in with.
            User::create([
                'name' => $data['contact'] ?? $data['name'],
                'username' => $data['username'],
                'email' => strtolower(trim($data['email'])),
                'phone' => trim($data['phone']),
                'password_hash' => password_hash($plainPassword, PASSWORD_BCRYPT),
                'role_slug' => 'agency_owner',
                'agency_name' => $data['name'],
                'agency_id' => $agency->id,
                'status' => 'active',
            ]);

            return $agency;
        });

        return ApiResponse::created(
            array_merge($agency->toPublic(), [
                'credentials' => [
                    'username' => $data['username'],
                    'password' => $plainPassword,
                    'loginUrl' => $this->loginUrl(),
                ],
            ]),
            'Agency created successfully.'
        );
    }

    /** PUT /agencies/:id */
    public function update(Request $request, string $id)
    {
        $scope = $this->scopeAgencyId($request);
        if ($scope !== null && $id !== $scope) {
            throw new ApiException(403, 'You can only edit your own agency.');
        }

        $agency = Agency::find($id);
        if (! $agency) {
            throw new ApiException(404, 'Agency not found.');
        }

        foreach (['name', 'address', 'contact', 'email'] as $field) {
            if ($request->has($field)) {
                $agency->{$field} = $request->input($field);
            }
        }
        $agency->save();

        return ApiResponse::ok($agency->toPublic(), 'Agency updated.');
    }

    /** PATCH /agencies/:id/status */
    public function updateStatus(Request $request, string $id)
    {
        // Approving or deactivating an agency is an administrator action.
        $this->requireGlobalRole($request);

        Validator::make($request->all(), [
            'status' => 'required|in:pending,active,deactivated',
        ], ['status.in' => 'Unknown status.'])->validate();

        $agency = Agency::find($id);
        if (! $agency) {
            throw new ApiException(404, 'Agency not found.');
        }

        $auth = $request->attributes->get('auth_user');
        $status = $request->input('status');
        $agency->status = $status;
        $agency->status_changed_at = now()->toIso8601String();
        $agency->status_changed_by = $auth['sub'] ?? null;
        $agency->save();

        $verb = ['active' => 'activated', 'pending' => 'moved back to pending', 'deactivated' => 'deactivated'][$status];

        return ApiResponse::ok($agency->toPublic(), $agency->name.' has been '.$verb.'.');
    }

    /** POST /agencies/:id/credentials/reset */
    public function resetCredentials(Request $request, string $id)
    {
        // Without this an agency with `agencies,edit` could reset another
        // agency's password and take the account over.
        $this->requireGlobalRole($request);

        $agency = Agency::find($id);
        if (! $agency) {
            throw new ApiException(404, 'Agency not found.');
        }

        $plainPassword = Credentials::generatePassword();
        $hash = password_hash($plainPassword, PASSWORD_BCRYPT);

        DB::transaction(function () use ($agency, $hash) {
            $agency->password_hash = $hash;
            $agency->save();

            // Sign-in reads the users table, so rotate the login too.
            User::where('agency_id', $agency->id)
                ->where('role_slug', 'agency_owner')
                ->update(['password_hash' => $hash]);
        });

        return ApiResponse::ok([
            'username' => $agency->username,
            'password' => $plainPassword,
            'loginUrl' => $this->loginUrl(),
        ], 'New credentials generated.');
    }

    /** DELETE /agencies/:id */
    public function destroy(Request $request, string $id)
    {
        $this->requireGlobalRole($request);

        $agency = Agency::find($id);
        if (! $agency) {
            throw new ApiException(404, 'Agency not found.');
        }
        $agency->delete();

        return ApiResponse::ok(['id' => $id], 'Agency deleted.');
    }
}
