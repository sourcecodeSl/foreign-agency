<?php

namespace App\Http\Controllers\Api\Admin;

use App\Enums\AccountStatus;
use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Models\Agency;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Main Admin only. Creating an agency also creates its login account, and the
 * generated password is returned exactly once so the admin can hand it over.
 */
class AgencyController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $agencies = Agency::query()
            ->withCount('candidates')
            ->when($request->query('status', 'all') !== 'all',
                fn ($q) => $q->where('status', $request->query('status')))
            ->when($request->query('search'), function ($q, $term) {
                $like = '%' . $term . '%';
                $q->where(fn ($w) => $w->where('name', 'like', $like)
                    ->orWhere('code', 'like', $like)
                    ->orWhere('email', 'like', $like));
            })
            ->with('users:id,agency_id,username,email,status')
            ->latest()
            ->get();

        return $this->ok($agencies);
    }

    public function counts(): JsonResponse
    {
        return $this->ok([
            'all' => Agency::count(),
            'pending' => Agency::where('status', AccountStatus::Pending)->count(),
            'active' => Agency::where('status', AccountStatus::Active)->count(),
            'deactivated' => Agency::where('status', AccountStatus::Deactivated)->count(),
        ]);
    }

    public function show(Agency $agency): JsonResponse
    {
        return $this->ok($agency->load('users:id,agency_id,username,email,status')->loadCount('candidates'));
    }

    /**
     * Creates the agency plus its login. The password is generated when the
     * admin does not supply one, and is shown only in this response.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'min:3', 'max:150'],
            'address' => ['required', 'string', 'min:8'],
            'username' => ['required', 'string', 'min:4', 'max:60', 'regex:/^[a-zA-Z0-9._-]+$/', Rule::unique('users', 'username')],
            'email' => ['required', 'email', 'max:190', Rule::unique('users', 'email')],
            'phone' => ['required', 'string', 'max:20', Rule::unique('users', 'phone')],
            'contact_person' => ['nullable', 'string', 'max:120'],
            'password' => ['nullable', 'string', 'min:8', 'regex:/[A-Z]/', 'regex:/[0-9]/'],
        ], [
            'password.regex' => 'Password must include an uppercase letter and a number.',
            'username.regex' => 'Username may use letters, numbers, dot, underscore and hyphen only.',
        ]);

        $plainPassword = $data['password'] ?? $this->generatePassword();

        $result = DB::transaction(function () use ($data, $plainPassword, $request) {
            $agency = Agency::create([
                'code' => Agency::generateCode($data['name']),
                'name' => $data['name'],
                'address' => $data['address'],
                'contact_person' => $data['contact_person'] ?? null,
                'email' => $data['email'],
                'phone' => $data['phone'],
                'status' => AccountStatus::Pending,
                'created_by' => $request->user()->id,
            ]);

            $user = User::create([
                'name' => $data['contact_person'] ?? $data['name'],
                'username' => $data['username'],
                'email' => mb_strtolower($data['email']),
                'phone' => $data['phone'],
                'password' => $plainPassword,     // hashed by the model cast
                'role' => UserRole::Agency,
                'agency_id' => $agency->id,
                'status' => AccountStatus::Active,
                'must_change_password' => true,
            ]);

            return compact('agency', 'user');
        });

        return response()->json([
            'success' => true,
            'message' => 'Agency created. Share these credentials with the agency owner.',
            'data' => [
                'agency' => $result['agency'],
                // Shown once - only the hash is stored.
                'credentials' => [
                    'username' => $result['user']->username,
                    'password' => $plainPassword,
                    'login_url' => config('app.frontend_url', config('app.url')) . '/login',
                ],
            ],
        ], 201);
    }

    public function update(Request $request, Agency $agency): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'min:3', 'max:150'],
            'address' => ['sometimes', 'string', 'min:8'],
            'contact_person' => ['nullable', 'string', 'max:120'],
            'email' => ['sometimes', 'email', 'max:190'],
            'phone' => ['sometimes', 'string', 'max:20'],
        ]);

        $agency->update($data);

        return $this->ok($agency->fresh(), 'Agency updated.');
    }

    /** Approve, deactivate or move back to pending. */
    public function updateStatus(Request $request, Agency $agency): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(AccountStatus::values())],
        ]);

        $agency->update(['status' => $data['status']]);

        return $this->ok($agency->fresh(), $agency->name . ' is now ' . $data['status'] . '.');
    }

    /** Issues a fresh password for the agency login. */
    public function resetCredentials(Agency $agency): JsonResponse
    {
        $user = $agency->users()->first();

        if (! $user) {
            return response()->json([
                'success' => false,
                'message' => 'This agency has no login account.',
            ], 404);
        }

        $plainPassword = $this->generatePassword();
        $user->update(['password' => $plainPassword, 'must_change_password' => true]);

        return $this->ok([
            'username' => $user->username,
            'password' => $plainPassword,
            'login_url' => config('app.frontend_url', config('app.url')) . '/login',
        ], 'New credentials generated.');
    }

    public function destroy(Agency $agency): JsonResponse
    {
        $agency->delete();

        return $this->ok(['id' => $agency->id], 'Agency deleted.');
    }

    /** Random password that always satisfies the create rules. */
    private function generatePassword(int $length = 12): string
    {
        $sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%*?'];
        $chars = array_map(fn ($set) => $set[random_int(0, strlen($set) - 1)], $sets);
        $all = implode('', $sets);

        while (count($chars) < $length) {
            $chars[] = $all[random_int(0, strlen($all) - 1)];
        }

        shuffle($chars);

        return implode('', $chars);
    }

    private function ok(mixed $data, ?string $message = null): JsonResponse
    {
        return response()->json(['success' => true, 'data' => $data, 'message' => $message]);
    }
}
