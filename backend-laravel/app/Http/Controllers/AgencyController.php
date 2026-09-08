<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Models\Agency;
use App\Models\AppCounter;
use App\Support\ApiResponse;
use App\Support\Credentials;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class AgencyController extends Controller
{
    private function loginUrl(): string
    {
        return rtrim((string) (env('CLIENT_URL') ?: env('APP_URL') ?: ''), '/').'/agency/login';
    }

    /** GET /agencies?status=&search= */
    public function index(Request $request)
    {
        $status = $request->query('status', 'all');
        $search = trim((string) $request->query('search', ''));

        $query = Agency::query();
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
    public function counts()
    {
        return ApiResponse::ok([
            'all' => Agency::count(),
            'pending' => Agency::where('status', 'pending')->count(),
            'active' => Agency::where('status', 'active')->count(),
            'deactivated' => Agency::where('status', 'deactivated')->count(),
        ]);
    }

    /** GET /agencies/:id */
    public function show(string $id)
    {
        $agency = Agency::find($id);
        if (! $agency) {
            throw new ApiException(404, 'Agency not found.');
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
        ], [
            'name.min' => 'Name must be at least 3 characters.',
            'address.min' => 'Please provide the full address.',
            'username.regex' => 'Username must be 4-20 characters (letters, numbers, . _ -).',
            'password.min' => 'Password must be at least 8 characters.',
            'password.regex' => 'Password must include an uppercase letter and a number.',
        ])->validate();

        if (Agency::where('username', $data['username'])->exists()) {
            throw new ApiException(409, 'That username is already taken.', ['username' => 'That username is already taken.']);
        }

        $auth = $request->attributes->get('auth_user');
        $sequence = AppCounter::next('agency');
        $plainPassword = $data['password'] ?: Credentials::generatePassword();

        $agency = Agency::create([
            'id' => 'AG-'.$sequence,
            'name' => $data['name'],
            'code' => Credentials::generateAgencyCode($data['name'], $sequence),
            'address' => $data['address'],
            'username' => $data['username'],
            'password_hash' => password_hash($plainPassword, PASSWORD_BCRYPT),
            'contact' => $data['contact'] ?? '-',
            'email' => $data['email'] ?? '-',
            'users' => 0,
            'status' => 'pending',
            'created_at' => now()->format('Y-m-d'),
            'created_by' => $auth['sub'] ?? null,
        ]);

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
    public function resetCredentials(string $id)
    {
        $agency = Agency::find($id);
        if (! $agency) {
            throw new ApiException(404, 'Agency not found.');
        }

        $plainPassword = Credentials::generatePassword();
        $agency->password_hash = password_hash($plainPassword, PASSWORD_BCRYPT);
        $agency->save();

        return ApiResponse::ok([
            'username' => $agency->username,
            'password' => $plainPassword,
            'loginUrl' => $this->loginUrl(),
        ], 'New credentials generated.');
    }

    /** DELETE /agencies/:id */
    public function destroy(string $id)
    {
        $agency = Agency::find($id);
        if (! $agency) {
            throw new ApiException(404, 'Agency not found.');
        }
        $agency->delete();

        return ApiResponse::ok(['id' => $id], 'Agency deleted.');
    }
}
