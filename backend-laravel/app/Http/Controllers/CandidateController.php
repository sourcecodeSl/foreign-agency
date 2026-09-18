<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Models\Agency;
use App\Models\Candidate;
use App\Models\SkillTest;
use App\Support\ApiResponse;
use App\Support\DocumentType;
use App\Support\Nic;
use App\Support\PageAccess;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Candidate registration, by an agency or by a coordinator on its behalf.
 *
 * Candidates never sign in, so nothing here touches passwords or OTP. Every
 * query is scoped to the agency that owns the record; roles that work across
 * agencies (main_admin, auditor, coordinator) see everything.
 *
 * The journey: the agency switches a candidate to passed, which opens the
 * file for documents and ties the person to that agency; the agency attaches
 * the documents; a coordinator checks them and submits the whole profile.
 */
class CandidateController extends Controller
{
    /** Roles that are not tied to a single agency. */
    private const GLOBAL_ROLES = PageAccess::CROSS_AGENCY_ROLES;

    /** Roles that check a passed candidate's documents and submit the profile. */
    private const REVIEWER_ROLES = ['main_admin', PageAccess::ROLE];

    /**
     * GET /candidates?agencyId=
     *
     * An agency login sees its own candidates. A cross-agency role browses one
     * agency at a time and has to name it: candidate files are agency records,
     * so there is no listing that pours every agency into one pile.
     */
    public function index(Request $request)
    {
        $auth = $request->attributes->get('auth_user');

        // Branch on the role, not on whether a scope came back: an agency login
        // with no agency linked would otherwise look like a cross-agency role
        // and be handed a silent empty list instead of being told what is wrong.
        if (in_array($auth['roleSlug'] ?? null, self::GLOBAL_ROLES, true)) {
            $scope = trim((string) $request->query('agencyId'));

            // Nothing picked yet - an empty listing, not everybody's records.
            if ($scope === '') {
                return ApiResponse::ok([]);
            }

            // The master Candidate List asks for every agency at once.
            if ($scope === 'all') {
                $scope = null;
            }
        } else {
            $scope = $auth['agencyId'] ?? null;
            if (! $scope) {
                throw new ApiException(403, 'Your account is not linked to an agency.');
            }
        }

        $candidates = Candidate::query()
            ->forAgency($scope)
            ->search($request->query('search'))
            ->when($request->query('status', 'all') !== 'all',
                fn ($q) => $q->where('status', $request->query('status')))
            ->when($request->query('poolStatus', 'all') !== 'all',
                fn ($q) => $q->where('pool_status', $request->query('poolStatus')))
            ->with(['documents', 'jobRole', 'jobRoles', 'lockedCompany', 'tests.company', 'tests.role', 'creator', 'submitter'])
            ->orderByDesc('id')
            ->get();

        // Blocked files, for the whole page in one query.
        Candidate::resolveBlocks($candidates);

        // The master list spans agencies, so each row names the one it is from.
        $agencyNames = $scope === null
            ? Agency::whereIn('id', $candidates->pluck('agency_id')->unique())->pluck('name', 'id')
            : collect();

        $holders = $this->holderNames($request, $candidates);

        return ApiResponse::ok($candidates->map(fn (Candidate $candidate) => $candidate->toPublic(true) + [
            'agencyName' => $agencyNames[$candidate->agency_id] ?? null,
            'blockedBy' => $holders[$candidate->id] ?? null,
        ])->all());
    }

    /** GET /candidates/{id} */
    public function show(Request $request, $id)
    {
        $candidate = $this->find($request, $id);

        return ApiResponse::ok($candidate->load(['documents', 'jobRole', 'jobRoles', 'tests.company', 'tests.role'])->toPublic(true) + [
            'blockedBy' => $this->holderNames($request, collect([$candidate]))[$candidate->id] ?? null,
        ]);
    }

    /**
     * For a cross-agency role, the agency holding the pass that blocks each
     * file. An agency is never told: agencies do not see each other's files.
     *
     * @return array<int, string> candidate id => agency name
     */
    private function holderNames(Request $request, $candidates): array
    {
        if ($this->scopeAgencyId($request) !== null) {
            return [];
        }

        $blocked = $candidates->filter(fn (Candidate $c) => $c->isBlocked());
        $names = Agency::whereIn('id', $blocked->map(fn (Candidate $c) => $c->passedElsewhere()->agency_id)->unique())
            ->pluck('name', 'id');

        return $blocked->mapWithKeys(fn (Candidate $c) => [
            $c->id => $names[$c->passedElsewhere()->agency_id] ?? 'another agency',
        ])->all();
    }

    /**
     * Refuses a NIC that belongs to someone who has passed with another
     * agency: passing ties a person to that one agency.
     *
     * An agency is not told which agency holds them - agencies never see
     * each other's files - but a cross-agency role is.
     */
    private function refusePassedElsewhere(Request $request, string $agencyId, ?string $nicNo): void
    {
        $holder = Candidate::passedHolder($agencyId, $nicNo);
        if (! $holder) {
            return;
        }

        $where = $this->scopeAgencyId($request) === null
            ? (Agency::find($holder->agency_id)?->name ?? 'another agency')
            : 'another agency';

        $message = 'The candidate with NIC '.$nicNo.' has already passed with '.$where
            .', so they cannot be registered with another agency.';

        throw new ApiException(409, $message, ['nicNo' => $message]);
    }

    /** Refuses any change to a file whose person has passed with another agency. */
    private function refuseBlocked(Candidate $candidate): void
    {
        if ($candidate->isBlocked()) {
            throw new ApiException(409, $candidate->name.' has already passed with another agency, '
                .'so this file is blocked.');
        }
    }

    /**
     * A file this agency removed earlier that still holds the passport or NIC
     * being registered now.
     *
     * Removing a candidate is a soft delete: the row stays, so the passport
     * and NIC stay taken in the database even though the listing no longer
     * shows them. The NIC is compared in either format.
     */
    private function removedMatch(string $agencyId, array $identity): ?Candidate
    {
        $nicKey = Nic::key($identity['nicNo'] ?? null);

        return Candidate::onlyTrashed()
            ->where('agency_id', $agencyId)
            ->where(function ($q) use ($identity, $nicKey) {
                $q->where('passport_no', $identity['passportNo']);

                if ($nicKey) {
                    $q->orWhere('nic_key', $nicKey);
                }
            })
            ->orderByDesc('id')
            ->first();
    }

    /** POST /candidates */
    public function store(Request $request)
    {
        $agencyId = $this->writeAgencyId($request);
        $data = $this->validated($request, $agencyId);
        $auth = $request->attributes->get('auth_user');

        // Not passed yet, the same person may try with any agency; passed,
        // they belong to the agency that holds the pass. Known by NIC.
        $this->refusePassedElsewhere($request, $agencyId, $data['nicNo']);

        $roleIds = $this->roleIds($data);

        $fields = [
            'name' => $data['name'],
            'passport_no' => $data['passportNo'],
            'nic_no' => strtoupper($data['nicNo']),
            'address' => $data['address'],
            'mobile' => $data['mobile'],
            'email' => $data['email'] ?? null,
            'job_role_id' => $roleIds[0] ?? null,
            'test_index_no' => $data['testIndexNo'] ?? null,
            'notes' => $data['notes'] ?? null,
            'status' => 'draft',
            // Whoever registers the person now is where the file came from,
            // including when a removed file is brought back.
            'source' => Candidate::sourceFor($auth['roleSlug'] ?? null),
            'created_by' => $auth['sub'] ?? null,
        ];

        // Registering the same person again brings back the file that was
        // removed, documents and all, instead of failing on the passport that
        // file still holds.
        $removed = $this->removedMatch($agencyId, [
            'passportNo' => $data['passportNo'],
            'nicNo' => $data['nicNo'] ?? null,
        ]);

        if ($removed) {
            $removed->restore();
            $removed->fill($fields)->save();
            $candidate = $removed;
        } else {
            $candidate = Candidate::create($fields + ['agency_id' => $agencyId]);
        }

        // A file brought back keeps the trades it had, plus the ones given now.
        $candidate->addJobRoles($roleIds);

        return ApiResponse::created([
            'candidate' => $candidate->load(['documents', 'jobRole', 'jobRoles'])->toPublic(true),
            'requiredDocuments' => DocumentType::options(),
            'restored' => (bool) $removed,
        ], $removed
            ? $candidate->name.' has been registered again. The file removed earlier is back, with its documents.'
            : 'Candidate registered. Documents are attached once the candidate has passed.');
    }

    /** PUT /candidates/{id} */
    public function update(Request $request, $id)
    {
        $candidate = $this->find($request, $id);
        $this->refuseBlocked($candidate);
        $data = $this->validated($request, $candidate->agency_id, $candidate->id);

        // The unique rules skip removed files, which still hold their passport
        // and NIC, so say what is in the way rather than letting the database
        // refuse the write.
        $removed = $this->removedMatch($candidate->agency_id, [
            'passportNo' => $data['passportNo'] ?? $candidate->passport_no,
            'nicNo' => $data['nicNo'] ?? $candidate->nic_no,
        ]);

        if ($removed) {
            throw new ApiException(409, 'A candidate removed earlier holds this passport number or NIC. '
                .'Register them again to bring that file back.');
        }

        // Changing the NIC must not turn this file into someone who has
        // passed with another agency.
        $newNic = $data['nicNo'] ?? null;
        if ($newNic !== null && Nic::key($newNic) !== $candidate->nic_key) {
            $this->refusePassedElsewhere($request, $candidate->agency_id, $newNic);
        }

        $candidate->update(array_filter([
            'name' => $data['name'] ?? null,
            'passport_no' => $data['passportNo'] ?? null,
            'nic_no' => $newNic !== null ? strtoupper($newNic) : null,
            'address' => $data['address'] ?? null,
            'mobile' => $data['mobile'] ?? null,
            'email' => $data['email'] ?? null,
            'test_index_no' => $data['testIndexNo'] ?? null,
            'notes' => $data['notes'] ?? null,
        ], fn ($v) => $v !== null));

        // A null single trade from an older client leaves the trades as they are.
        if (array_key_exists('jobRoleIds', $data) || ! empty($data['jobRoleId'])) {
            $this->replaceJobRoles($candidate, $this->roleIds($data));
        }

        return ApiResponse::ok($candidate->fresh()->load(['documents', 'jobRole', 'jobRoles'])->toPublic(true), 'Candidate updated.');
    }

    /**
     * PATCH /candidates/{id}/pass  { passed: true|false }
     *
     * The agency's own switch. Passing opens the file for documents and ties
     * the person to this agency, so no other agency can register them.
     */
    public function pass(Request $request, $id)
    {
        if ($this->scopeAgencyId($request) === null) {
            throw new ApiException(403, 'Only the agency that holds this candidate can mark them as passed.');
        }

        $candidate = $this->find($request, $id);
        $passed = (bool) $request->validate(['passed' => ['required', 'boolean']])['passed'];

        if ($passed === $candidate->isPassed()) {
            return ApiResponse::ok($candidate->load(['documents', 'jobRole', 'jobRoles'])->toPublic(true),
                $candidate->name.($passed ? ' is already marked as passed.' : ' is not marked as passed.'));
        }

        if ($passed) {
            // A skill test booked by a coordinator is still waiting for its result.
            if ($candidate->pool_status === 'testing') {
                $open = $candidate->tests()->where('status', SkillTest::OPEN)->first();

                throw new ApiException(409, $candidate->name.' has an open skill test'
                    .($open ? ' ('.$open->test_no.')' : '').'. The coordinator records its result.');
            }

            // The NIC is what keeps every other agency away, so it must be on file.
            if (! $candidate->nic_key) {
                throw new ApiException(422, 'Add the NIC number to '.$candidate->name
                    ."'s file before marking them as passed.");
            }

            if ($candidate->passedElsewhere()) {
                throw new ApiException(409, $candidate->name.' has already passed with another agency, so they cannot be passed here.');
            }

            $candidate->update([
                'pool_status' => 'passed',
                'passed_at' => now(),
                'passed_by' => $request->attributes->get('auth_user')['sub'] ?? null,
            ]);

            // Every other agency's file for this NIC is blocked from now on.
            $blocked = $candidate->filesElsewhere()->count();
            $message = $candidate->name.' is marked as passed. You can now attach the documents.'
                .($blocked ? ' Their file'.($blocked === 1 ? '' : 's').' at '.$blocked.' other '
                    .($blocked === 1 ? 'agency is' : 'agencies are').' now blocked.' : '');
        } else {
            if ($candidate->locked_company_id) {
                throw new ApiException(409, $candidate->name.' passed a skill test with '
                    .($candidate->lockedCompany?->name ?? 'a foreign agency').', so the pass cannot be switched off here.');
            }

            if (in_array($candidate->status, Candidate::LOCKED_STATUSES, true)) {
                throw new ApiException(409, 'The coordinator has already submitted '.$candidate->name
                    ."'s profile, so the pass cannot be switched off.");
            }

            $candidate->update(['pool_status' => 'pool', 'passed_at' => null, 'passed_by' => null]);
            $message = $candidate->name.' is no longer marked as passed. Documents are closed again, and other agencies may register them.';
        }

        return ApiResponse::ok($candidate->fresh()->load(['documents', 'jobRole', 'jobRoles'])->toPublic(true), $message);
    }

    /**
     * PATCH /candidates/{id}/status
     *
     * The review decisions belong to a coordinator (or the Main Admin): they
     * check the documents a passed candidate's agency attached and submit the
     * whole profile. An agency attaches, but never submits.
     */
    public function updateStatus(Request $request, $id)
    {
        $role = $request->attributes->get('auth_user')['roleSlug'] ?? null;
        if (! in_array($role, self::REVIEWER_ROLES, true)) {
            throw new ApiException(403, "Only a coordinator can check the documents and submit a candidate's profile.");
        }

        $candidate = $this->find($request, $id);

        $validated = $request->validate([
            'status' => ['required', Rule::in(['draft', 'submitted', 'approved', 'rejected'])],
        ]);

        if ($validated['status'] === 'submitted') {
            if (! $candidate->isPassed()) {
                throw new ApiException(422, 'Only a candidate who has passed can be submitted.');
            }

            // The file set must be complete before the profile goes forward.
            $missing = $candidate->missingDocumentTypes();
            if ($missing !== []) {
                throw new ApiException(422, 'Upload every required document before submitting.', [
                    'documents' => $missing,
                ]);
            }
        }

        $submitted = $validated['status'] === 'submitted';
        // Switching the submit off sends the profile back to the agency as a
        // draft, open for documents again, with no submission on record.
        $sentBack = $validated['status'] === 'draft' && $candidate->status === 'submitted';

        $candidate->update([
            'status' => $validated['status'],
            'submitted_at' => $submitted ? now() : ($validated['status'] === 'draft' ? null : $candidate->submitted_at),
            'submitted_by' => $submitted
                ? ($request->attributes->get('auth_user')['sub'] ?? null)
                : ($validated['status'] === 'draft' ? null : $candidate->submitted_by),
        ]);

        $message = match (true) {
            $submitted => $candidate->name."'s profile has been submitted.",
            $sentBack => $candidate->name."'s profile is back with the agency.",
            default => 'Candidate marked as '.$validated['status'].'.',
        };

        return ApiResponse::ok($candidate->fresh()->load(['documents', 'jobRole', 'jobRoles'])->toPublic(true), $message);
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

    /**
     * The trades asked for: the list if one was sent, else the single trade
     * an older client sends. Duplicates dropped, order kept.
     *
     * @return int[]
     */
    private function roleIds(array $data): array
    {
        $ids = $data['jobRoleIds'] ?? (isset($data['jobRoleId']) ? [$data['jobRoleId']] : []);

        return array_values(array_unique(array_map('intval', array_filter((array) $ids))));
    }

    /**
     * Sets the file's trades to the list given. A trade the candidate has
     * already been tested for stays, so the test history always names a
     * trade that is on the file.
     */
    private function replaceJobRoles(Candidate $candidate, array $roleIds): void
    {
        $tested = $candidate->tests()->pluck('job_role_id')->map(fn ($id) => (int) $id)->all();
        $keep = array_values(array_unique(array_merge($roleIds, $tested)));

        $candidate->jobRoles()->sync($keep);

        // The registered trade follows the list when it is no longer on it.
        if (! in_array((int) $candidate->job_role_id, $keep, true)) {
            $candidate->update(['job_role_id' => $keep[0] ?? null]);
        }
    }

    private function validated(Request $request, ?string $agencyId, $ignoreId = null): array
    {
        $required = $request->isMethod('POST') ? 'required' : 'sometimes';

        // Passport and NIC are unique within one agency, not globally, so the
        // same person may appear under two different agencies.
        $scoped = fn (string $column) => Rule::unique('candidates', $column)
            ->where(fn ($q) => $q->where('agency_id', $agencyId)->whereNull('deleted_at'))
            ->ignore($ignoreId);

        // The NIC is how a person is known across agencies, so it is required,
        // and the old and new formats of one number count as the same person.
        $nicFree = function (string $attribute, $value, \Closure $fail) use ($agencyId, $ignoreId) {
            $taken = Candidate::query()
                ->where('agency_id', $agencyId)
                ->samePerson((string) $value)
                ->when($ignoreId, fn ($q) => $q->whereKeyNot($ignoreId))
                ->exists();

            if ($taken) {
                $fail('A candidate with this NIC already exists.');
            }
        };

        return $request->validate([
            'name' => [$required, 'string', 'min:3', 'max:150'],
            'passportNo' => [$required, 'string', 'max:30', 'regex:/^[A-Za-z0-9]+$/', $scoped('passport_no')],
            'nicNo' => [$required, 'string', 'max:20', 'regex:'.Nic::PATTERN, $nicFree],
            'address' => [$required, 'string', 'min:5', 'max:255'],
            'mobile' => [$required, 'string', 'regex:/^[0-9+\s-]{9,20}$/'],
            'email' => ['nullable', 'email', 'max:190'],
            // Optional on the API so an older client still registers; the
            // registration screen asks for the job category.
            'jobRoleId' => ['nullable', 'integer', Rule::exists('job_roles', 'id')->where('active', true)],
            // Everything the candidate can do - a Tiler who can also do shuttering.
            'jobRoleIds' => ['nullable', 'array', 'max:20'],
            'jobRoleIds.*' => ['integer', 'distinct', Rule::exists('job_roles', 'id')->where('active', true)],
            'testIndexNo' => ['nullable', 'string', 'max:40', 'regex:/^[A-Za-z0-9\/-]+$/'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ], [
            'jobRoleId.exists' => 'Choose a job category from the list.',
            'jobRoleIds.*.exists' => 'Choose job categories from the list.',
            'jobRoleIds.*.distinct' => 'Each job category is listed once.',
            'testIndexNo.regex' => 'The test index number may contain letters, numbers, / and - only.',
            'passportNo.regex' => 'Passport number may contain letters and numbers only.',
            'nicNo.required' => 'NIC number is required.',
            'nicNo.regex' => 'Enter a valid NIC (9 digits plus V/X, or 12 digits).',
            'passportNo.unique' => 'A candidate with this passport number already exists.',
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
