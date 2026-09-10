<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Models\AppCounter;
use App\Models\Role;
use App\Models\User;
use App\Support\ApiResponse;
use App\Support\Credentials;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class RoleController extends Controller
{
    /** GET /roles - user types, each with a live user count. */
    public function index()
    {
        $roles = Role::all()->map(function (Role $role) {
            return array_merge($role->toPublic(), [
                'users' => User::where('role_slug', $role->slug)->count(),
            ]);
        })->values();

        return ApiResponse::ok($roles);
    }

    /** POST /roles */
    public function store(Request $request)
    {
        Validator::make($request->all(), [
            'name' => 'required|string|min:3',
            'description' => 'required|string',
        ], [
            'name.min' => 'Role name must be at least 3 characters.',
            'description.required' => 'Describe what this role can do.',
        ])->validate();

        $slug = Credentials::slugify($request->input('name'));
        if (Role::where('slug', $slug)->exists()) {
            throw new ApiException(409, 'A role with that name already exists.', ['name' => 'A role with that name already exists.']);
        }

        $sequence = AppCounter::next('role');
        $role = Role::create([
            'id' => 'RL-'.str_pad((string) $sequence, 2, '0', STR_PAD_LEFT),
            'name' => $request->input('name'),
            'slug' => $slug,
            'description' => $request->input('description'),
            'is_system' => false,
            'permissions' => Role::emptyMatrix(),
        ]);

        return ApiResponse::created(array_merge($role->toPublic(), ['users' => 0]), 'Role created.');
    }

    /** PUT /roles/:id */
    public function update(Request $request, string $id)
    {
        $role = Role::find($id);
        if (! $role) {
            throw new ApiException(404, 'Role not found.');
        }
        if ($role->is_system) {
            throw new ApiException(400, 'System roles cannot be edited.');
        }

        $role->name = $request->input('name', $role->name);
        $role->description = $request->input('description', $role->description);
        $role->save();

        return ApiResponse::ok($role->toPublic(), 'Role updated.');
    }

    /** DELETE /roles/:id */
    public function destroy(string $id)
    {
        $role = Role::find($id);
        if (! $role) {
            throw new ApiException(404, 'Role not found.');
        }
        if ($role->is_system) {
            throw new ApiException(400, 'System roles cannot be deleted.');
        }

        $inUse = User::where('role_slug', $role->slug)->count();
        if ($inUse > 0) {
            throw new ApiException(409, 'Reassign the '.$inUse.' user(s) on this role before deleting it.');
        }

        $role->delete();

        return ApiResponse::ok(['id' => $id], 'Role deleted.');
    }

    /** GET /roles/:slug/permissions */
    public function getPermissions(string $slug)
    {
        $role = Role::where('slug', $slug)->first();
        if (! $role) {
            throw new ApiException(404, 'Role not found.');
        }

        return ApiResponse::ok($role->permissions ?: Role::emptyMatrix());
    }

    /** PUT /roles/:slug/permissions */
    public function savePermissions(Request $request, string $slug)
    {
        Validator::make($request->all(), [
            'permissions' => 'required|array',
        ], ['permissions.required' => 'A permissions object is required.'])->validate();

        $role = Role::where('slug', $slug)->first();
        if (! $role) {
            throw new ApiException(404, 'Role not found.');
        }
        if ($role->slug === 'main_admin') {
            throw new ApiException(400, 'The Main Admin role always holds full access.');
        }

        // cleanMatrix rebuilds the whole grid and reads a missing module as
        // "no access", so a payload that leaves one out silently revokes it -
        // which is how agency logins lost the candidates module. A save has to
        // describe every module, or it is not a save of the whole matrix.
        $incoming = (array) $request->input('permissions');
        $absent = array_values(array_diff(Role::MODULES, array_keys($incoming)));

        if ($absent !== []) {
            throw new ApiException(422, 'This looks like an out-of-date screen: it did not include '.implode(', ', $absent).'. Reload the page and try again.', [
                'permissions' => 'Missing module(s): '.implode(', ', $absent).'.',
            ]);
        }

        $clean = Role::cleanMatrix($incoming);
        $role->permissions = $clean;
        $role->save();

        return ApiResponse::ok($clean, 'Permissions updated for '.$role->name.'.');
    }
}
