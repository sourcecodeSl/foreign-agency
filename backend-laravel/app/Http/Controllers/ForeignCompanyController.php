<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Models\Candidate;
use App\Models\ForeignCompany;
use App\Models\SkillTest;
use App\Models\User;
use App\Support\ApiResponse;
use App\Support\PageAccess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

/**
 * Foreign agencies - the overseas employers that run skill tests and hire -
 * each managed by the coordinator (foreign agent) who brought it in.
 *
 * These are separate records from the agencies that register candidates and
 * sign in, even where one is marked foreign. The class and table keep the
 * word company so the schema does not move.
 *
 * A coordinator sees and edits only their own; the Main Admin sees every one
 * and may hand it to a different coordinator. Agency logins have no business
 * here at all - they deal with their own candidates.
 */
class ForeignCompanyController extends Controller
{
    private const MESSAGES = [
        'name.required' => 'Foreign agency name is required.',
        'name.min' => 'The name must be at least 2 characters.',
        'country.required' => 'Say which country the foreign agency is in.',
        'contactEmail.email' => 'Enter a valid email address.',
        'coordinatorId.integer' => 'Choose the coordinator who manages this foreign agency.',
        'status.in' => 'Unknown status.',
    ];

    private function role(Request $request): ?string
    {
        return $request->attributes->get('auth_user')['roleSlug'] ?? null;
    }

    private function userId(Request $request): ?int
    {
        $id = $request->attributes->get('auth_user')['sub'] ?? null;

        return $id === null ? null : (int) $id;
    }

    /** Reading is for the Main Admin, auditors and coordinators. */
    private function requireReader(Request $request): void
    {
        if (! in_array($this->role($request), PageAccess::CROSS_AGENCY_ROLES, true)) {
            throw new ApiException(403, 'Foreign agencies are managed by the Main Admin and coordinators.');
        }
    }

    /** Writing is for the Main Admin and coordinators; an auditor only reads. */
    private function requireWriter(Request $request): void
    {
        if (! in_array($this->role($request), ['main_admin', PageAccess::ROLE], true)) {
            throw new ApiException(403, 'Foreign agencies are managed by the Main Admin and coordinators.');
        }
    }

    /** A coordinator is held to their own foreign agencies; the Main Admin is not. */
    private function scopeCoordinatorId(Request $request): ?int
    {
        return $this->role($request) === PageAccess::ROLE ? $this->userId($request) : null;
    }

    private function find(Request $request, string $id): ForeignCompany
    {
        $company = ForeignCompany::find($id);
        if (! $company) {
            throw new ApiException(404, 'Foreign agency not found.');
        }

        $scope = $this->scopeCoordinatorId($request);
        if ($scope !== null && (int) $company->coordinator_id !== $scope) {
            throw new ApiException(403, 'That foreign agency is managed by another coordinator.');
        }

        return $company;
    }

    /** GET /companies?status=&search= */
    public function index(Request $request)
    {
        $this->requireReader($request);

        $status = $request->query('status', 'all');
        $search = trim((string) $request->query('search', ''));
        $scope = $this->scopeCoordinatorId($request);

        $companies = ForeignCompany::query()
            ->when($scope !== null, fn ($q) => $q->where('coordinator_id', $scope))
            ->when(in_array($status, ['active', 'inactive'], true), fn ($q) => $q->where('status', $status))
            ->when($search !== '', function ($q) use ($search) {
                $term = '%'.$search.'%';
                $q->where(function ($inner) use ($term) {
                    $inner->where('name', 'like', $term)
                        ->orWhere('code', 'like', $term)
                        ->orWhere('country', 'like', $term)
                        ->orWhere('city', 'like', $term);
                });
            })
            ->with('coordinator')
            ->orderByDesc('id')
            ->get();

        // One grouped query each, rather than two per row.
        $passed = Candidate::whereIn('locked_company_id', $companies->pluck('id'))
            ->selectRaw('locked_company_id, COUNT(*) as total')
            ->groupBy('locked_company_id')
            ->pluck('total', 'locked_company_id');

        $open = SkillTest::whereIn('company_id', $companies->pluck('id'))
            ->where('status', SkillTest::OPEN)
            ->selectRaw('company_id, COUNT(*) as total')
            ->groupBy('company_id')
            ->pluck('total', 'company_id');

        $rows = $companies->map(fn (ForeignCompany $c) => $c->toPublic([
            'passedCandidates' => (int) ($passed[$c->id] ?? 0),
            'openTests' => (int) ($open[$c->id] ?? 0),
        ]))->values();

        return ApiResponse::ok($rows);
    }

    /** GET /companies/{id} */
    public function show(Request $request, string $id)
    {
        $this->requireReader($request);
        $company = $this->find($request, $id);

        return ApiResponse::ok($company->load('coordinator')->toPublic([
            'passedCandidates' => $company->lockedCandidates()->count(),
            'openTests' => $company->tests()->where('status', SkillTest::OPEN)->count(),
        ]));
    }

    /** POST /companies */
    public function store(Request $request)
    {
        $this->requireWriter($request);

        Validator::make($request->all(), [
            'name' => 'required|string|min:2|max:150',
            'country' => 'required|string|max:80',
            'city' => 'nullable|string|max:80',
            'contactName' => 'nullable|string|max:120',
            'contactEmail' => 'nullable|email|max:190',
            'contactPhone' => 'nullable|string|max:20',
            'coordinatorId' => 'nullable|integer',
            'notes' => 'nullable|string|max:255',
        ], self::MESSAGES)->validate();

        $company = ForeignCompany::create([
            'code' => ForeignCompany::nextCode(),
            'name' => trim($request->input('name')),
            'country' => trim($request->input('country')),
            'city' => $request->input('city'),
            'contact_name' => $request->input('contactName'),
            'contact_email' => $request->input('contactEmail'),
            'contact_phone' => $request->input('contactPhone'),
            'coordinator_id' => $this->coordinatorFor($request),
            'status' => 'active',
            'notes' => $request->input('notes'),
        ]);

        return ApiResponse::created($company->load('coordinator')->toPublic(), $company->name.' has been added.');
    }

    /**
     * Whose foreign agency this is. A coordinator always owns what they create; the
     * Main Admin says who manages it, and may leave it unassigned.
     */
    private function coordinatorFor(Request $request, ?ForeignCompany $company = null): ?int
    {
        if ($this->role($request) === PageAccess::ROLE) {
            return $this->userId($request);
        }

        if (! $request->has('coordinatorId')) {
            return $company?->coordinator_id;
        }

        $id = $request->input('coordinatorId');
        if ($id === null || $id === '') {
            return null;
        }

        $coordinator = User::where('id', $id)->where('role_slug', PageAccess::ROLE)->first();
        if (! $coordinator) {
            throw new ApiException(422, 'That coordinator was not found.', [
                'coordinatorId' => 'Choose a coordinator.',
            ]);
        }

        return (int) $coordinator->id;
    }

    /** PUT /companies/{id} */
    public function update(Request $request, string $id)
    {
        $this->requireWriter($request);
        $company = $this->find($request, $id);

        Validator::make($request->all(), [
            'name' => 'sometimes|string|min:2|max:150',
            'country' => 'sometimes|string|max:80',
            'city' => 'nullable|string|max:80',
            'contactName' => 'nullable|string|max:120',
            'contactEmail' => 'nullable|email|max:190',
            'contactPhone' => 'nullable|string|max:20',
            'coordinatorId' => 'nullable|integer',
            'notes' => 'nullable|string|max:255',
        ], self::MESSAGES)->validate();

        foreach ([
            'name' => 'name',
            'country' => 'country',
            'city' => 'city',
            'contactName' => 'contact_name',
            'contactEmail' => 'contact_email',
            'contactPhone' => 'contact_phone',
            'notes' => 'notes',
        ] as $input => $column) {
            if ($request->has($input)) {
                $company->{$column} = $request->input($input);
            }
        }

        $company->coordinator_id = $this->coordinatorFor($request, $company);
        $company->save();

        return ApiResponse::ok($company->load('coordinator')->toPublic(), $company->name.' has been updated.');
    }

    /** PATCH /companies/{id}/status */
    public function updateStatus(Request $request, string $id)
    {
        $this->requireWriter($request);

        Validator::make($request->all(), [
            'status' => 'required|in:active,inactive',
        ], self::MESSAGES)->validate();

        $company = $this->find($request, $id);
        $company->status = $request->input('status');
        $company->save();

        return ApiResponse::ok(
            $company->toPublic(),
            $company->name.($company->status === 'active' ? ' is active again.' : ' has been set inactive.')
        );
    }

    /**
     * GET /companies/{id}/candidates - this foreign agency's roster.
     *
     * Only candidates who passed a test here: passing locks a candidate to one
     * foreign agency, and no other one's pipeline may show them.
     */
    public function candidates(Request $request, string $id)
    {
        $this->requireReader($request);
        $company = $this->find($request, $id);

        $candidates = Candidate::where('locked_company_id', $company->id)
            ->with(['documents', 'lockedCompany', 'tests.company', 'tests.role'])
            ->orderByDesc('id')
            ->get();

        return ApiResponse::ok($candidates->map->toPublic(true)->values());
    }
}
