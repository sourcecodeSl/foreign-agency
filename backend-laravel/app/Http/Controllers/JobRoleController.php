<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Models\JobRole;
use App\Support\ApiResponse;
use App\Support\PageAccess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

/**
 * The trades candidates are tested for. Everyone signed in can read the list -
 * an agency sees which role its candidate was tested for - and only the Main
 * Admin and coordinators add to it or take a trade off it.
 */
class JobRoleController extends Controller
{
    /** Who looks after the list of job categories. */
    private const MANAGERS = ['main_admin', PageAccess::ROLE];

    private function requireManager(Request $request): void
    {
        $role = $request->attributes->get('auth_user')['roleSlug'] ?? null;

        if (! in_array($role, self::MANAGERS, true)) {
            throw new ApiException(403, 'Only the Main Admin and coordinators can change the job categories.');
        }
    }

    /** GET /job-roles?status=active */
    public function index(Request $request)
    {
        $roles = JobRole::query()
            ->when($request->query('status', 'active') === 'active', fn ($q) => $q->where('active', true))
            ->orderBy('name')
            ->get();

        return ApiResponse::ok($roles->map->toPublic()->values());
    }

    /**
     * POST /job-roles
     *
     * A trade that was taken off the list earlier comes back, with its old id,
     * so the candidates and tests that name it still point at the same row.
     */
    public function store(Request $request)
    {
        $this->requireManager($request);

        Validator::make($request->all(), [
            'name' => 'required|string|min:2|max:120',
        ], ['name.required' => 'Name the job role.'])->validate();

        $name = trim(preg_replace('/\s+/', ' ', $request->input('name')));
        $slug = JobRole::slugify($name);

        $existing = JobRole::where('slug', $slug)->first();

        if ($existing && $existing->active) {
            throw new ApiException(409, 'That job role already exists.', ['name' => 'That job role already exists.']);
        }

        if ($existing) {
            $existing->update(['name' => $name, 'active' => true]);

            return ApiResponse::ok($existing->toPublic(), $existing->name.' is back on the list.');
        }

        $role = JobRole::create(['name' => $name, 'slug' => $slug, 'active' => true]);

        return ApiResponse::created($role->toPublic(), $role->name.' has been added.');
    }

    /**
     * DELETE /job-roles/{id}
     *
     * Takes the trade off the list: it can no longer be picked for a new
     * candidate or test. Candidates and tests that already name it keep it,
     * so the row is switched off rather than deleted.
     */
    public function destroy(Request $request, string $id)
    {
        $this->requireManager($request);

        $role = JobRole::where('id', $id)->where('active', true)->first();
        if (! $role) {
            throw new ApiException(404, 'That job role was not found.');
        }

        $role->update(['active' => false]);

        return ApiResponse::ok(['id' => $role->id], $role->name.' has been removed from the list.');
    }
}
