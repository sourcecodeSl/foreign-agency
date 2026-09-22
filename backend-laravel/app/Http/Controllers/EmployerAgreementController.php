<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Models\Agency;
use App\Models\EmployerAgreement;
use App\Models\User;
use App\Services\TranslationService;
use App\Support\ApiResponse;
use App\Support\EmployerDetails;
use App\Support\PageAccess;
use Illuminate\Http\Request;

/**
 * The employer part of the employment agreement, from the foreign company's
 * side: the company submits it from its own login, not the Main Admin or a
 * coordinator.
 *
 * Nothing in English is typed: it is read from the company's own record - on
 * the draft, and again when it is submitted, so what is kept always matches
 * the record. EmployerDetails carries it into Hebrew and Sinhala, and every
 * name and translated value can be corrected before submitting.
 */
class EmployerAgreementController extends Controller
{
    private const MAX_VALUE = 500;

    /** The signed-in login's agency, which must be a foreign company. */
    private function foreignCompany(Request $request): array
    {
        $auth = $request->attributes->get('auth_user');
        $user = User::find($auth['sub'] ?? null);
        $agency = $user?->agency_id ? Agency::find($user->agency_id) : null;

        if (! $agency || ($agency->type ?? 'local') !== 'foreign') {
            throw new ApiException(403, 'Only a foreign company submits the employer part of the agreement.');
        }

        return [$user, $agency];
    }

    /** GET /employer-agreement/draft - the paper, filled from the company record. */
    public function draft(Request $request)
    {
        [, $agency] = $this->foreignCompany($request);

        [$values, $translationError] = EmployerDetails::fill($agency);

        return ApiResponse::ok([
            'section' => EmployerDetails::section(),
            'values' => $values,
            'missing' => EmployerDetails::missing(EmployerDetails::english($agency)),
            'translation' => TranslationService::configured(),
            'translationError' => $translationError,
        ]);
    }

    /**
     * POST /employer-agreement  { values: { company_address: { he, si, auto }, ... } }
     *
     * Only the Hebrew and Sinhala of the names and translated fields are read
     * from the request; everything else comes from the company record.
     */
    public function store(Request $request)
    {
        [$user, $agency] = $this->foreignCompany($request);

        $request->validate([
            'values' => ['sometimes', 'array'],
            'values.*.he' => ['nullable', 'string', 'max:'.self::MAX_VALUE],
            'values.*.si' => ['nullable', 'string', 'max:'.self::MAX_VALUE],
            'values.*.auto' => ['nullable', 'array'],
        ], [
            'values.*.*.max' => 'A value may not be longer than '.self::MAX_VALUE.' characters.',
        ]);

        $missing = EmployerDetails::missing(EmployerDetails::english($agency));
        if ($missing) {
            throw new ApiException(422, 'Complete the company details first - missing: '.implode(', ', $missing).'.');
        }

        $agreement = EmployerAgreement::create([
            'agency_id' => $agency->id,
            'field_values' => EmployerDetails::fromRequest($agency, (array) $request->input('values', [])),
            'submitted_by' => $user->id,
        ]);

        return ApiResponse::created($agreement->load('agency', 'submitter')->toPublic(), 'Agreement submitted.');
    }

    /**
     * GET /employer-agreements - a foreign company reads its own submissions;
     * the Main Admin and coordinators with the agreements page read them all.
     */
    public function index(Request $request)
    {
        $role = $request->attributes->get('auth_user')['roleSlug'] ?? null;
        $query = EmployerAgreement::with('agency', 'submitter')->orderByDesc('id');

        if (! in_array($role, ['main_admin', PageAccess::ROLE], true)) {
            [, $agency] = $this->foreignCompany($request);
            $query->where('agency_id', $agency->id);
        }

        return ApiResponse::ok([
            'section' => EmployerDetails::section(),
            'agreements' => $query->get()->map->toPublic()->values(),
        ]);
    }
}
