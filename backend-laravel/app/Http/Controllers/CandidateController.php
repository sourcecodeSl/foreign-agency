<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Models\Candidate;
use App\Support\ApiResponse;
use App\Support\DocumentType;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Candidate registration, performed by an agency.
 *
 * Candidates never sign in, so nothing here touches passwords or OTP. Every
 * query is scoped to the agency that owns the record; roles that work across
 * agencies (main_admin, auditor) see everything.
 */
class CandidateController extends Controller
{
    /** Roles that are not tied to a single agency. */
    private const GLOBAL_ROLES = ['main_admin', 'auditor'];

    /** GET /candidates */
    public function index(Request $request)
    {
        $candidates = Candidate::query()
            ->forAgency($this->scopeAgencyId($request))
            ->search($request->query('search'))
            ->when($request->query('status', 'all') !== 'all',
                fn ($q) => $q->where('status', $request->query('status')))
            ->with('documents')
            ->orderByDesc('id')
            ->get();

        return ApiResponse::ok($candidates->map->toPublic(true)->all());
    }

    /** GET /candidates/{id} */
    public function show(Request $request, $id)
    {
        $candidate = $this->find($request, $id);

        return ApiResponse::ok($candidate->load('documents')->toPublic(true));
    }

    /** POST /candidates */
    public function store(Request $request)
    {
        $agencyId = $this->writeAgencyId($request);
        $data = $this->validated($request, $agencyId);

        $candidate = Candidate::create([
            'agency_id' => $agencyId,
            'name' => $data['name'],
            'passport_no' => $data['passportNo'],
            'nic_no' => $data['nicNo'] ?? null,
            'address' => $data['address'],
            'mobile' => $data['mobile'],
            'email' => $data['email'] ?? null,
            'notes' => $data['notes'] ?? null,
            'status' => 'draft',
            'created_by' => $request->attributes->get('auth_user')['sub'] ?? null,
        ]);

        return ApiResponse::created([
            'candidate' => $candidate->load('documents')->toPublic(true),
            'requiredDocuments' => DocumentType::options(),
        ], 'Candidate registered. You can now attach the required documents.');
    }

    /** PUT /candidates/{id} */
    public function update(Request $request, $id)
    {
        $candidate = $this->find($request, $id);
        $data = $this->validated($request, $candidate->agency_id, $candidate->id);

        $candidate->update(array_filter([
            'name' => $data['name'] ?? null,
            'passport_no' => $data['passportNo'] ?? null,
            'nic_no' => $data['nicNo'] ?? null,
            'address' => $data['address'] ?? null,
            'mobile' => $data['mobile'] ?? null,
            'email' => $data['email'] ?? null,
            'notes' => $data['notes'] ?? null,
        ], fn ($v) => $v !== null));

        return ApiResponse::ok($candidate->fresh()->load('documents')->toPublic(true), 'Candidate updated.');
    }

    /** PATCH /candidates/{id}/status */
    public function updateStatus(Request $request, $id)
    {
        $candidate = $this->find($request, $id);

        $validated = $request->validate([
            'status' => ['required', Rule::in(['draft', 'submitted', 'approved', 'rejected'])],
        ]);

        // The file set must be complete before it goes forward for review.
        if ($validated['status'] === 'submitted') {
            $missing = $candidate->missingDocumentTypes();
            if ($missing !== []) {
                throw new ApiException(422, 'Upload every required document before submitting.', [
                    'documents' => $missing,
                ]);
            }
        }

        $candidate->update(['status' => $validated['status']]);

        return ApiResponse::ok($candidate->fresh()->toPublic(), 'Candidate marked as '.$validated['status'].'.');
    }

    /** DELETE /candidates/{id} */
    public function destroy(Request $request, $id)
    {
        $candidate = $this->find($request, $id);
        $candidate->delete();   // soft delete; the files are kept

        return ApiResponse::ok(['id' => $candidate->id], 'Candidate removed.');
    }

    /** GET /candidates/document-types - the checklist the UI renders. */
    public function documentTypes()
    {
        return ApiResponse::ok(DocumentType::options());
    }

    // ---------------------------------------------------------------------

    private function validated(Request $request, ?string $agencyId, $ignoreId = null): array
    {
        $required = $request->isMethod('POST') ? 'required' : 'sometimes';

        // Passport and NIC are unique within one agency, not globally, so the
        // same person may appear under two different agencies.
        $scoped = fn (string $column) => Rule::unique('candidates', $column)
            ->where(fn ($q) => $q->where('agency_id', $agencyId)->whereNull('deleted_at'))
            ->ignore($ignoreId);

        return $request->validate([
            'name' => [$required, 'string', 'min:3', 'max:150'],
            'passportNo' => [$required, 'string', 'max:30', 'regex:/^[A-Za-z0-9]+$/', $scoped('passport_no')],
            // Optional: the agency registration form collects passport, name,
            // address, mobile and email. NIC is accepted when supplied.
            'nicNo' => ['nullable', 'string', 'max:20', 'regex:/^([0-9]{9}[VvXx]|[0-9]{12})$/', $scoped('nic_no')],
            'address' => [$required, 'string', 'min:5', 'max:255'],
            'mobile' => [$required, 'string', 'regex:/^[0-9+\s-]{9,20}$/'],
            'email' => ['nullable', 'email', 'max:190'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ], [
            'passportNo.regex' => 'Passport number may contain letters and numbers only.',
            'nicNo.regex' => 'Enter a valid NIC (9 digits plus V/X, or 12 digits).',
            'passportNo.unique' => 'A candidate with this passport number already exists.',
            'nicNo.unique' => 'A candidate with this NIC already exists.',
            'mobile.regex' => 'Enter a valid mobile number.',
        ]);
    }

    /** Null for roles that span agencies, the own agency id otherwise. */
    private function scopeAgencyId(Request $request): ?string
    {
        $auth = $request->attributes->get('auth_user');

        if (in_array($auth['roleSlug'] ?? null, self::GLOBAL_ROLES, true)) {
            return null;
        }

        return $auth['agencyId'] ?? null;
    }

    /** The agency a new candidate is filed under. */
    private function writeAgencyId(Request $request): string
    {
        $auth = $request->attributes->get('auth_user');

        // A cross-agency role has to say which agency it is filing for.
        if (in_array($auth['roleSlug'] ?? null, self::GLOBAL_ROLES, true)) {
            $agencyId = $request->input('agencyId');
            if (! $agencyId) {
                throw new ApiException(422, 'Specify the agency this candidate belongs to.', [
                    'agencyId' => 'An agency is required.',
                ]);
            }

            return $agencyId;
        }

        $agencyId = $auth['agencyId'] ?? null;
        if (! $agencyId) {
            throw new ApiException(403, 'Your account is not linked to an agency.');
        }

        return $agencyId;
    }

    /** Loads a candidate the caller is allowed to touch. */
    private function find(Request $request, $id): Candidate
    {
        $candidate = Candidate::find($id);

        if (! $candidate) {
            throw new ApiException(404, 'Candidate not found.');
        }

        $scope = $this->scopeAgencyId($request);
        if ($scope !== null && $candidate->agency_id !== $scope) {
            throw new ApiException(403, 'This candidate belongs to another agency.');
        }

        return $candidate;
    }
}
