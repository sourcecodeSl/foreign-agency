<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Models\Role;
use App\Models\User;
use App\Support\ApiResponse;
use App\Support\Credentials;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class UserController extends Controller
{
    /** GET /users?role=&status=&search= */
    public function index(Request $request)
    {
        $role = $request->query('role', 'all');
        $status = $request->query('status', 'all');
        $search = trim((string) $request->query('search', ''));

        $query = User::query();
        if ($role !== 'all') {
            $query->where('role_slug', $role);
        }
        if ($status !== 'all') {
            $query->where('status', $status);
        }
        if ($search !== '') {
            $term = '%'.$search.'%';
            $query->where(function ($q) use ($term) {
                $q->where('name', 'like', $term)
                    ->orWhere('email', 'like', $term)
                    ->orWhere('phone', 'like', $term);
            });
        }

        $rows = $query->orderByDesc('created_at')->orderByDesc('id')->get()
            ->map(fn (User $u) => $u->toPublic())->values();

        return ApiResponse::ok($rows);
    }

    /** GET /users/:id */
    public function show(string $id)
    {
        $user = User::find($id);
        if (! $user) {
            throw new ApiException(404, 'User not found.');
        }

        return ApiResponse::ok($user->toPublic());
    }

    /** POST /users */
    public function store(Request $request)
    {
        $data = $request->all();
        Validator::make($data, [
            'name' => 'required|string|min:3',
            'email' => 'required|email',
            'phone' => 'required|string',
            'roleSlug' => 'required|string',
        ], [
            'name.min' => 'Name is required.',
            'email.email' => 'A valid email is required.',
            'phone.required' => 'Phone number is required.',
            'roleSlug.required' => 'Assign a user type.',
        ])->validate();

        $role = Role::where('slug', $data['roleSlug'])->first();
        if (! $role) {
            throw new ApiException(422, 'Unknown user type.', ['roleSlug' => 'Unknown user type.']);
        }

        if (User::emailExists($data['email'])) {
            throw new ApiException(409, 'That email is already registered.', ['email' => 'That email is already registered.']);
        }

        $tempPassword = Credentials::generatePassword();
        $user = User::create([
            'name' => trim($data['name']),
            'email' => strtolower(trim($data['email'])),
            'phone' => trim($data['phone']),
            'password_hash' => password_hash($tempPassword, PASSWORD_BCRYPT),
            'role_slug' => $data['roleSlug'],
            'agency_name' => $data['agency'] ?? null,
            'status' => 'pending',
        ]);

        return ApiResponse::created(
            array_merge($user->toPublic(), ['credentials' => ['email' => $user->email, 'password' => $tempPassword]]),
            'User created.'
        );
    }

    /** PUT /users/:id */
    public function update(Request $request, string $id)
    {
        Validator::make($request->all(), [
            'email' => 'sometimes|email',
        ], ['email.email' => 'A valid email is required.'])->validate();

        $user = User::find($id);
        if (! $user) {
            throw new ApiException(404, 'User not found.');
        }

        if ($request->has('name')) {
            $user->name = $request->input('name');
        }
        // A changed email or phone has not been confirmed, so the next sign-in
        // asks for that one again. An unchanged value keeps its date.
        if ($request->has('email')) {
            $email = strtolower(trim((string) $request->input('email')));
            if ($email !== $user->email) {
                $user->email = $email;
                $user->email_verified_at = null;
            }
        }
        if ($request->has('phone')) {
            $phone = (string) $request->input('phone');
            if (preg_replace('/\D/', '', $phone) !== preg_replace('/\D/', '', (string) $user->phone)) {
                $user->phone_verified_at = null;
            }
            $user->phone = $phone;
        }
        if ($request->has('agency')) {
            $user->agency_name = $request->input('agency');
        }
        if ($request->filled('roleSlug')) {
            $role = Role::where('slug', $request->input('roleSlug'))->first();
            if (! $role) {
                throw new ApiException(422, 'Unknown user type.');
            }
            $user->role_slug = $request->input('roleSlug');
        }
        $user->save();

        return ApiResponse::ok($user->toPublic(), 'User updated.');
    }

    /** PATCH /users/:id/status */
    public function updateStatus(Request $request, string $id)
    {
        Validator::make($request->all(), [
            'status' => 'required|in:active,pending,deactivated',
        ])->validate();

        $auth = $request->attributes->get('auth_user');
        if ((string) $id === (string) ($auth['sub'] ?? '')) {
            throw new ApiException(400, 'You cannot change the status of your own account.');
        }

        $user = User::find($id);
        if (! $user) {
            throw new ApiException(404, 'User not found.');
        }
        $user->status = $request->input('status');
        $user->save();

        return ApiResponse::ok($user->toPublic(), $user->name.' is now '.$user->status.'.');
    }

    /** DELETE /users/:id */
    public function destroy(Request $request, string $id)
    {
        $auth = $request->attributes->get('auth_user');
        if ((string) $id === (string) ($auth['sub'] ?? '')) {
            throw new ApiException(400, 'You cannot delete your own account.');
        }

        $user = User::find($id);
        if (! $user) {
            throw new ApiException(404, 'User not found.');
        }
        $user->delete();

        return ApiResponse::ok(['id' => $id], 'User removed.');
    }
}
