<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Models\Country;
use App\Support\ApiResponse;
use App\Support\PageAccess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

/**
 * The countries offered where a foreign company's country is asked for.
 *
 * The list is read by anybody, signed in or not: an agency registering itself
 * picks its country before it has a login. Only the Main Admin and
 * coordinators add to the list or take a country off it.
 */
class CountryController extends Controller
{
    /** Who looks after the list. */
    private const MANAGERS = ['main_admin', PageAccess::ROLE];

    private function requireManager(Request $request): void
    {
        $role = $request->attributes->get('auth_user')['roleSlug'] ?? null;

        if (! in_array($role, self::MANAGERS, true)) {
            throw new ApiException(403, 'Only the Main Admin and coordinators can change the country list.');
        }
    }

    /** GET /countries - public, in the order they are offered. */
    public function index()
    {
        return ApiResponse::ok(
            Country::where('active', true)->orderBy('name')->get()->map->toPublic()->values()
        );
    }

    /**
     * POST /countries
     *
     * One taken off the list earlier comes back with its own row, rather than
     * a second row for the same country.
     */
    public function store(Request $request)
    {
        $this->requireManager($request);

        Validator::make($request->all(), [
            'name' => 'required|string|min:2|max:80',
        ], ['name.required' => 'Name the country.'])->validate();

        $name = trim(preg_replace('/\s+/', ' ', $request->input('name')));
        $slug = Country::slugify($name);

        $existing = Country::where('slug', $slug)->first();

        if ($existing && $existing->active) {
            throw new ApiException(409, 'That country is already on the list.', ['name' => 'That country is already on the list.']);
        }

        if ($existing) {
            $existing->update(['name' => $name, 'active' => true]);

            return ApiResponse::ok($existing->toPublic(), $existing->name.' is back on the list.');
        }

        $country = Country::create(['name' => $name, 'slug' => $slug, 'active' => true]);

        return ApiResponse::created($country->toPublic(), $country->name.' has been added.');
    }

    /**
     * DELETE /countries/{id}
     *
     * Takes the country off the list, so it is no longer offered. An agency
     * already registered in it keeps the country it was registered with, so
     * the row is switched off rather than deleted.
     */
    public function destroy(Request $request, string $id)
    {
        $this->requireManager($request);

        $country = Country::where('id', $id)->where('active', true)->first();
        if (! $country) {
            throw new ApiException(404, 'That country was not found.');
        }

        $country->update(['active' => false]);

        return ApiResponse::ok(['id' => $country->id], $country->name.' has been removed from the list.');
    }
}
