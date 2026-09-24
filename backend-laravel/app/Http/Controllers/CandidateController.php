<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Models\Agency;
use App\Models\Candidate;
use App\Models\CandidateRegistration;
use App\Models\CandidateTestResult;
use App\Models\JobRole;
use App\Models\SkillTest;
use App\Support\ApiResponse;
use App\Support\DocumentType;
use App\Support\Nic;
use App\Support\PageAccess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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

    /** What a single candidate's file is read with. */
    private const DETAIL = [
        'documents', 'jobRole', 'jobRoles', 'companyAgency', 'testResultRole',
        'categoryResults.role', 'categoryResults.company', 'registrations.jobRoles', 'registrations.company',
    ];

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
            // Reading one foreign company's candidates: whoever was registered
            // for its test, whichever agency registered them.
            if ($request->filled('companyAgencyId')) {
                return $this->companyCandidates(
                    $request->query('companyAgencyId'),
                    $request->query('agencyId'),
                    $request->query('search')
                );
            }

            $scope = trim((string) $request->query('agencyId'));

            // Nothing picked yet - an empty listing, not everybody's records.
            if ($scope === '') {
                return ApiResponse::ok([]);
            }

            // The master Candidate List asks for every agency at once.
            if ($scope === 'all') {
                $scope = null;
            }
        } elseif ($this->isForeignCompany($request)) {
            // A foreign company reads whoever was registered for its test,
            // whichever local agency registered them.
            return $this->companyCandidates(
                $auth['agencyId'],
                $request->query('agencyId'),
                $request->query('search')
            );
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
            ->with(['documents', 'jobRole', 'jobRoles', 'lockedCompany', 'tests.company', 'tests.role', 'creator', 'submitter', 'categoryResults.role', 'categoryResults.company', 'registrations.jobRoles', 'registrations.company'])
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
        // The company testing them reads the file too.
        $candidate = $this->find($request, $id, true);

        return ApiResponse::ok($candidate->load(['documents', 'jobRole', 'jobRoles', 'tests.company', 'tests.role', 'categoryResults.role', 'categoryResults.company', 'registrations.jobRoles', 'registrations.company'])->toPublic(true) + [
            'blockedBy' => $this->holderNames($request, collect([$candidate]))[$candidate->id] ?? null,
            // The same person registered for other companies, once passed here.
            'otherRegistrations' => $this->otherRegistrations($request, $candidate),
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
        // A foreign company registers nobody: local agencies register
        // candidates for its test, and it records how each one went.
        if ($this->isForeignCompany($request)) {
            throw new ApiException(403, 'A foreign company does not register candidates. '
                .'Local agencies register them for your test, and you record the result.');
        }

        $agencyId = $this->writeAgencyId($request);
        $data = $this->validated($request, $agencyId);
        $auth = $request->attributes->get('auth_user');

        // Not passed yet, the same person may try with any agency; passed,
        // they belong to the agency that holds the pass. Known by NIC.
        $this->refusePassedElsewhere($request, $agencyId, $data['nicNo']);

        $roleIds = $this->roleIds($data);

        $fields = [
            'name' => $this->fullName($data),
            'first_name' => $data['firstName'] ?? null,
            'last_name' => $data['lastName'] ?? null,
            'father_name' => $data['fatherName'] ?? null,
            'passport_expiry' => $data['passportExpiry'] ?? null,
            'profession' => $data['profession'] ?? null,
            'test_results' => $data['testResults'] ?? null,
            'company_agency_id' => $this->companyAgencyId($data),
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

        // The company chosen on the form is the first one they are put up with.
        if ($candidate->company_agency_id) {
            $candidate->registerWith($candidate->company_agency_id, $roleIds, $auth['sub'] ?? null);
        }

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

        // Passed with the company they were registered for: they stay with it,
        // and no other foreign company can be put down for them.
        $newCompany = $this->companyAgencyId($data);
        if ($newCompany !== null && $candidate->isPassed() && $newCompany !== $candidate->company_agency_id) {
            throw new ApiException(409, $candidate->name.' has passed, so the foreign company they are registered for cannot be changed.', [
                'companyAgencyId' => 'A passed candidate stays with the company they passed with.',
            ]);
        }

        // Changing the NIC must not turn this file into someone who has
        // passed with another agency.
        $newNic = $data['nicNo'] ?? null;
        if ($newNic !== null && Nic::key($newNic) !== $candidate->nic_key) {
            $this->refusePassedElsewhere($request, $candidate->agency_id, $newNic);
        }

        // A new first or last name rebuilds the full name from both halves.
        $fullName = isset($data['firstName']) || isset($data['lastName'])
            ? $this->fullName([
                'firstName' => $data['firstName'] ?? $candidate->first_name,
                'lastName' => $data['lastName'] ?? $candidate->last_name,
                'name' => $data['name'] ?? $candidate->name,
            ])
            : ($data['name'] ?? null);

        $oldCompany = $candidate->company_agency_id;

        $candidate->update(array_filter([
            'name' => $fullName,
            'first_name' => $data['firstName'] ?? null,
            'last_name' => $data['lastName'] ?? null,
            'father_name' => $data['fatherName'] ?? null,
            'passport_expiry' => $data['passportExpiry'] ?? null,
            'profession' => $data['profession'] ?? null,
            'test_results' => $data['testResults'] ?? null,
            'company_agency_id' => $newCompany,
            'passport_no' => $data['passportNo'] ?? null,
            'nic_no' => $newNic !== null ? strtoupper($newNic) : null,
            'address' => $data['address'] ?? null,
            'mobile' => $data['mobile'] ?? null,
            'email' => $data['email'] ?? null,
            'test_index_no' => $data['testIndexNo'] ?? null,
            'notes' => $data['notes'] ?? null,
        ], fn ($v) => $v !== null));

        $by = $request->attributes->get('auth_user')['sub'] ?? null;

        // A new company for the file: it takes over, and the old one goes
        // unless it has already recorded something.
        if ($newCompany !== null && $newCompany !== $oldCompany) {
            $old = $candidate->registrationFor($oldCompany);
            $candidate->registerWith($newCompany, $old
                ? $old->jobRoles->pluck('id')->all()
                : $candidate->jobRoles->pluck('id')->all(), $by);

            if ($old && ! $candidate->categoryResults()->where('company_agency_id', $oldCompany)->exists()) {
                $old->delete();
            }
            $candidate->unsetRelation('registrations');
        }

        // A null single trade from an older client leaves the trades as they are.
        if (array_key_exists('jobRoleIds', $data) || ! empty($data['jobRoleId'])) {
            $main = $candidate->registrationFor($candidate->company_agency_id);

            if ($main) {
                $this->replaceRegistrationRoles($candidate, $main, $this->roleIds($data));
            } else {
                $this->replaceJobRoles($candidate, $this->roleIds($data));
            }
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
        $auth = $request->attributes->get('auth_user');
        $candidate = Candidate::find($id);
        if (! $candidate) {
            throw new ApiException(404, 'Candidate not found.');
        }

        // The company the candidate is registered for says whether they
        // passed, and so does the admin side. The agency that registered them
        // only watches: it is not the one running the test.
        $global = in_array($auth['roleSlug'] ?? null, self::REVIEWER_ROLES, true);
        $company = $this->isForeignCompany($request) && $candidate->company_agency_id === ($auth['agencyId'] ?? null);

        if (! $global && ! $company) {
            throw new ApiException(403, 'Only the foreign company this candidate is registered for, '
                .'or the admin side, marks them as passed.');
        }
        $passed = (bool) $request->validate(['passed' => ['required', 'boolean']])['passed'];

        // The company names the trade they passed in, so it records the
        // result for that job category instead of flipping a switch.
        if (! $global && $passed) {
            throw new ApiException(422, 'Record the result against the job category '.$candidate->name
                .' passed in; that category becomes their profession.');
        }

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
                    .($candidate->lockedCompany?->name ?? 'a foreign company').', so the pass cannot be switched off here.');
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

    /**
     * PATCH /candidates/{id}/police-report
     *
     * Applied needs the reference number; received needs the date it was
     * issued as well, which is what the six-month validity runs from. A
     * report with little left on it is saved and warned about, not refused.
     */
    public function policeReport(Request $request, $id)
    {
        $candidate = $this->find($request, $id);
        $this->refuseBlocked($candidate);

        $data = $request->validate([
            'status' => ['required', Rule::in(['not_applied', 'applied', 'received'])],
            'referenceNo' => ['nullable', 'string', 'max:60', 'required_unless:status,not_applied'],
            'issuedDate' => ['nullable', 'date', 'before_or_equal:today', 'required_if:status,received'],
        ], [
            'status.in' => 'Choose whether the police report is applied for or received.',
            'referenceNo.required_unless' => 'Enter the police report reference number.',
            'issuedDate.required_if' => 'Enter the date the police report was issued.',
            'issuedDate.before_or_equal' => 'The police report cannot have been issued in the future.',
        ]);

        $candidate->update([
            'police_status' => $data['status'],
            // Nothing applied for yet means nothing on record either.
            'police_reference_no' => $data['status'] === 'not_applied' ? null : trim($data['referenceNo']),
            'police_issued_date' => $data['status'] === 'received' ? $data['issuedDate'] : null,
        ]);

        $candidate->refresh();

        $message = match ($data['status']) {
            'applied' => 'Police report applied for under '.$candidate->police_reference_no.'.',
            'received' => 'Police report '.$candidate->police_reference_no.' received. It is valid until '
                .$candidate->policeExpiry()->format('j M Y').'.',
            default => 'The police report has been cleared from this file.',
        };

        return ApiResponse::ok(
            $candidate->load(['documents', 'jobRole', 'jobRoles'])->toPublic(true),
            $candidate->policeWarning() ? $message.' '.$candidate->policeWarning() : $message
        );
    }

    /**
     * POST /candidates/{id}/registrations  { companyAgencyId, jobRoleIds[] }
     *
     * Puts the candidate up with another foreign company, for the job
     * categories that company tests them in. Only while they have not passed
     * with any company: a pass leaves the company that gave it as the only one.
     */
    public function addRegistration(Request $request, $id)
    {
        $candidate = $this->find($request, $id);
        $this->refuseBlocked($candidate);
        $this->refuseRegisteringPassed($candidate);

        $data = $this->registrationData($request, true);
        $companyId = $this->companyAgencyId($data);

        if ($candidate->isRegisteredWith($companyId)) {
            $message = $candidate->name.' is already registered with this company. Edit its job categories instead.';
            throw new ApiException(409, $message, ['companyAgencyId' => $message]);
        }

        $registration = $candidate->registerWith(
            $companyId,
            $data['jobRoleIds'],
            $request->attributes->get('auth_user')['sub'] ?? null
        );

        return ApiResponse::created(
            $this->publicCandidate($candidate),
            $candidate->name.' is registered with '.($registration->company?->name ?? 'the company').'.'
        );
    }

    /**
     * PUT /candidates/{id}/registrations/{registrationId}  { jobRoleIds[] }
     *
     * The job categories one company tests the candidate in. A category that
     * company has already given a result for stays on.
     */
    public function updateRegistration(Request $request, $id, $registrationId)
    {
        $candidate = $this->find($request, $id);
        $this->refuseBlocked($candidate);
        $registration = $this->registrationOf($candidate, $registrationId);

        if ($registration->state() === 'void') {
            throw new ApiException(409, $candidate->name.' has passed with another company, '
                .'so this registration is no longer valid.');
        }

        $data = $this->registrationData($request, false);
        $this->replaceRegistrationRoles($candidate, $registration, $data['jobRoleIds']);

        return ApiResponse::ok(
            $this->publicCandidate($candidate),
            'Job categories for '.($registration->company?->name ?? 'the company').' saved.'
        );
    }

    /**
     * DELETE /candidates/{id}/registrations/{registrationId}
     *
     * Takes the candidate off a company's list, as long as that company has
     * recorded nothing for them.
     */
    public function removeRegistration(Request $request, $id, $registrationId)
    {
        $candidate = $this->find($request, $id);
        $this->refuseBlocked($candidate);
        $registration = $this->registrationOf($candidate, $registrationId);
        $name = $registration->company?->name ?? 'the company';

        $hasResults = $candidate->categoryResults()
            ->where('company_agency_id', $registration->company_agency_id)
            ->exists();

        if ($hasResults || $registration->state() === 'passed') {
            throw new ApiException(409, $name.' has already recorded a result for '.$candidate->name
                .', so this registration stays.');
        }

        $registration->delete();

        // The file shows the next company it is registered with, if any.
        if ($candidate->company_agency_id === $registration->company_agency_id) {
            $candidate->company_agency_id = $candidate->registrations()
                ->where('id', '!=', $registration->id)
                ->value('company_agency_id');
            $candidate->save();
        }

        $candidate->unsetRelation('registrations');
        $candidate->syncJobRolesFromRegistrations();

        return ApiResponse::ok($this->publicCandidate($candidate), $candidate->name.' is no longer registered with '.$name.'.');
    }

    /** Registering with another company ends once the candidate has passed. */
    private function refuseRegisteringPassed(Candidate $candidate): void
    {
        if ($candidate->isPassed()) {
            $with = $candidate->companyAgency?->name;

            throw new ApiException(409, $candidate->name.' has already passed'.($with ? ' with '.$with : '')
                .', so they cannot be registered with another foreign company.');
        }
    }

    /** The company and the job categories for a registration. */
    private function registrationData(Request $request, bool $withCompany): array
    {
        return $request->validate([
            'companyAgencyId' => [$withCompany ? 'required' : 'prohibited', 'string', 'max:20'],
            'jobRoleIds' => ['required', 'array', 'min:1', 'max:20'],
            'jobRoleIds.*' => ['integer', 'distinct', Rule::exists('job_roles', 'id')->where('active', true)],
        ], [
            'companyAgencyId.required' => 'Choose the foreign company.',
            'jobRoleIds.required' => 'Choose at least one job category.',
            'jobRoleIds.min' => 'Choose at least one job category.',
            'jobRoleIds.*.exists' => 'Choose job categories from the list.',
            'jobRoleIds.*.distinct' => 'Each job category is listed once.',
        ]);
    }

    private function registrationOf(Candidate $candidate, $registrationId): CandidateRegistration
    {
        $registration = $candidate->registrations()->whereKey($registrationId)->first();
        if (! $registration) {
            throw new ApiException(404, 'That registration was not found on this candidate.');
        }

        return $registration->setRelation('candidate', $candidate);
    }

    /**
     * Sets one company's trades to the list given, keeping every trade it has
     * already recorded a result for, then rebuilds the file's own list.
     */
    private function replaceRegistrationRoles(Candidate $candidate, CandidateRegistration $registration, array $roleIds): void
    {
        $recorded = $candidate->categoryResults()
            ->where('company_agency_id', $registration->company_agency_id)
            ->pluck('job_role_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $registration->jobRoles()->sync(array_values(array_unique(array_merge(
            array_map('intval', $roleIds),
            $recorded
        ))));

        $candidate->unsetRelation('registrations');
        $candidate->syncJobRolesFromRegistrations();
    }

    private function publicCandidate(Candidate $candidate): array
    {
        return $candidate->fresh(self::DETAIL)->toPublic(true);
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

    /** "First Last", or the single full name an older client sends. */
    private function fullName(array $data): string
    {
        $parts = array_filter([trim($data['firstName'] ?? ''), trim($data['lastName'] ?? '')]);

        return $parts ? implode(' ', $parts) : trim($data['name'] ?? '');
    }

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
     * One foreign company's candidates: everyone registered for its test,
     * each naming the agency that registered them, and narrowed to one of
     * those agencies when asked for.
     */
    private function companyCandidates(?string $companyAgencyId, ?string $agencyId, ?string $search)
    {
        $candidates = Candidate::query()
            ->whereHas('registrations', fn ($q) => $q->where('company_agency_id', $companyAgencyId))
            ->when($agencyId && $agencyId !== 'all', fn ($q) => $q->where('agency_id', $agencyId))
            ->search($search)
            ->with(['documents', 'jobRole', 'jobRoles', 'companyAgency', 'testResultRole', 'lockedCompany', 'categoryResults.role', 'categoryResults.company', 'registrations.jobRoles', 'registrations.company'])
            // Those who passed first, in the order they passed, then everyone
            // still waiting, newest registration first.
            ->orderByRaw('CASE WHEN passed_at IS NULL THEN 1 ELSE 0 END')
            ->orderBy('passed_at')
            ->orderByDesc('id')
            ->get();

        Candidate::resolveBlocks($candidates);

        $agencyNames = Agency::whereIn('id', $candidates->pluck('agency_id')->unique())->pluck('name', 'id');

        return ApiResponse::ok($candidates->map(function (Candidate $candidate) use ($agencyNames, $companyAgencyId) {
            $payload = $candidate->toPublic(true);

            return $payload + [
                'agencyName' => $agencyNames[$candidate->agency_id] ?? null,
                // This company's own registration: its trades, results and whether it still stands.
                'registration' => collect($payload['registrations'])->firstWhere('company.id', $companyAgencyId),
            ];
        })->all());
    }

    /** A login belonging to an agency of type foreign - the company itself. */
    private function isForeignCompany(Request $request): bool
    {
        $auth = $request->attributes->get('auth_user');
        $agencyId = $auth['agencyId'] ?? null;

        return $agencyId ? (Agency::find($agencyId)?->type ?? 'local') === 'foreign' : false;
    }

    /**
     * PATCH /candidates/{id}/test-result  { result, jobRoleId, note?, testResults? }
     *
     * How the candidate's test went in one job category, recorded by the
     * foreign company they were registered for, or by the admin side. The
     * category is always named - a pass or a fail - and must be one of the
     * trades on the file, so the local agency reads exactly which one it was.
     *
     * A pass makes that trade their profession and marks them passed; a fail
     * leaves them in the pool, their other trades still open. Once passed,
     * only the trade they passed in can be changed - a fail there undoes the
     * pass, for a result recorded by mistake.
     */
    public function testResult(Request $request, $id)
    {
        $auth = $request->attributes->get('auth_user');
        $candidate = Candidate::find($id);
        if (! $candidate) {
            throw new ApiException(404, 'Candidate not found.');
        }

        $global = in_array($auth['roleSlug'] ?? null, self::REVIEWER_ROLES, true);
        $companyLogin = $this->isForeignCompany($request);

        if (! $global && ! ($companyLogin && $candidate->isRegisteredWith($auth['agencyId'] ?? null))) {
            throw new ApiException(403, 'Only a foreign company this candidate is registered with, '
                .'or the admin side, records the result.');
        }

        // A company records its own result; the admin side names the company,
        // unless the candidate is registered with just the one.
        $companyId = $companyLogin
            ? $auth['agencyId']
            : ($request->input('companyAgencyId')
                ?: ($candidate->registrations->count() === 1
                    ? $candidate->registrations->first()->company_agency_id
                    : $candidate->company_agency_id));

        $registration = $candidate->registrationFor($companyId)?->setRelation('candidate', $candidate);
        if (! $registration) {
            $message = 'Choose the foreign company this result is from.';
            throw new ApiException(422, $message, ['companyAgencyId' => $message]);
        }

        // Passed with one company: every other registration has lapsed.
        if ($registration->state() === 'void') {
            throw new ApiException(409, $candidate->name.' has already passed with '
                .($candidate->companyAgency?->name ?? 'another company')
                .', so the registration with '.($registration->company?->name ?? 'this company').' is no longer valid.');
        }

        if ($candidate->isRegistrationBlocked()) {
            throw new ApiException(409, $candidate->name.' has passed with another company, '
                .'so this registration is blocked and no result can be recorded.');
        }

        $data = $request->validate([
            'result' => ['required', 'in:pass,fail'],
            'jobRoleId' => ['required', 'integer'],
            'note' => ['nullable', 'string', 'max:255'],
            // What the test sheet says, in the company's own words.
            'testResults' => ['nullable', 'string', 'max:255'],
        ], [
            'result.in' => 'The result is either pass or fail.',
            'jobRoleId.required' => 'Choose the job category this result is for.',
        ]);

        $passed = $data['result'] === 'pass';

        // Only a trade the local agency put the candidate up for with this company.
        $role = $registration->jobRoles()->where('job_roles.id', $data['jobRoleId'])->first();
        if (! $role) {
            $message = 'Choose one of the job categories '.$candidate->name.' is registered for with '
                .($registration->company?->name ?? 'this company').'.';
            throw new ApiException(422, $message, ['jobRoleId' => $message]);
        }

        $passedRole = $candidate->isPassed()
            ? $candidate->categoryResults()->where('company_agency_id', $companyId)->where('result', 'pass')->value('job_role_id')
            : null;

        if ($passedRole && (int) $passedRole !== (int) $role->id) {
            throw new ApiException(409, $candidate->name.' has already passed as '
                .(JobRole::find($passedRole)?->name ?? 'another trade').', so no other job category can be recorded.');
        }

        // One person, one pass: the same NIC may be on file elsewhere.
        if ($passed && $candidate->passedElsewhere()) {
            throw new ApiException(409, $candidate->name.' has already passed with another agency.');
        }

        if (! $passed && $candidate->isPassed() && in_array($candidate->status, Candidate::LOCKED_STATUSES, true)) {
            throw new ApiException(409, 'The coordinator has already submitted '.$candidate->name
                ."'s profile, so the pass cannot be changed.");
        }

        DB::transaction(function () use ($candidate, $role, $data, $passed, $auth, $companyId) {
            CandidateTestResult::updateOrCreate(
                ['candidate_id' => $candidate->id, 'company_agency_id' => $companyId, 'job_role_id' => $role->id],
                [
                    'result' => $data['result'],
                    'note' => $data['note'] ?? null,
                    'recorded_by' => $auth['sub'] ?? null,
                ]
            );

            // The latest result, for the screens that show a single badge.
            $candidate->test_result = $data['result'];
            if (array_key_exists('testResults', $data)) {
                $candidate->test_results = $data['testResults'];
            }
            $candidate->test_result_role_id = $role->id;
            $candidate->test_result_note = $data['note'] ?? null;
            $candidate->test_result_at = now();
            $candidate->test_result_by = $auth['sub'] ?? null;

            if ($passed) {
                // The trade they passed in is what they work as from now on.
                $candidate->profession = $role->name;
                // The company that gave the pass is the one they belong to now.
                $candidate->company_agency_id = $companyId;
                $candidate->pool_status = 'passed';
                $candidate->passed_at = now();
                $candidate->passed_by = $auth['sub'] ?? null;
            } elseif ($candidate->isPassed() && ! $candidate->locked_company_id) {
                // The pass was this trade, and it has been taken back.
                $candidate->profession = null;
                $candidate->pool_status = 'pool';
                $candidate->passed_at = null;
                $candidate->passed_by = null;
            } elseif (! $candidate->isPassed()) {
                // Back in the pool, their other trades still open.
                $candidate->pool_status = 'pool';
            }

            $candidate->save();
        });

        $candidate = $candidate->fresh(self::DETAIL);
        $others = $passed ? $this->otherRegistrations($request, $candidate) : [];
        $open = count(array_filter($others, fn ($row) => ! $row['blocked']));

        return ApiResponse::ok(
            $candidate->toPublic(true) + ['otherRegistrations' => $others],
            $passed
                ? $candidate->name.' passed as '.$role->name.'.'
                    .($open ? ' They are also registered with '.$open.' other '
                        .($open === 1 ? 'company' : 'companies').' - you can block '
                        .($open === 1 ? 'it' : 'them').' on their profile.' : '')
                : $candidate->name.' did not pass as '.$role->name.'. The agency that registered them can see this result.'
        );
    }

    /**
     * The same person's files registered for other foreign companies, known
     * by NIC. Shown on a passed profile so the company that holds the pass
     * (or the admin side) can block them.
     *
     * The company each is registered for is named to everyone who reads the
     * profile; the local agency holding the file only to the admin side,
     * since agencies do not see each other's files.
     */
    private function otherRegistrations(Request $request, Candidate $candidate): array
    {
        if (! $candidate->isPassed() || ! $candidate->nic_key) {
            return [];
        }

        $global = $this->scopeAgencyId($request) === null;

        $files = $candidate->filesElsewhere()->with('companyAgency')->orderBy('id')->get();
        $agencies = $global
            ? Agency::whereIn('id', $files->pluck('agency_id')->unique())->pluck('name', 'id')
            : collect();

        return $files->map(fn (Candidate $file) => [
            'id' => $file->id,
            'company' => $file->company_agency_id ? [
                'id' => $file->company_agency_id,
                'name' => $file->companyAgency?->name,
            ] : null,
            'agencyName' => $global ? ($agencies[$file->agency_id] ?? null) : null,
            'blocked' => $file->isRegistrationBlocked(),
            'blockedAt' => $file->registration_blocked_at,
        ])->values()->all();
    }

    /**
     * PATCH /candidates/{id}/other-registrations/{otherId}  { blocked: bool }
     *
     * Blocks (or lets go) the same person's file registered for another
     * company. Only once they have passed here, and only by the company that
     * holds the pass or by the admin side.
     */
    public function blockRegistration(Request $request, $id, $otherId)
    {
        $auth = $request->attributes->get('auth_user');
        $candidate = Candidate::find($id);
        if (! $candidate) {
            throw new ApiException(404, 'Candidate not found.');
        }

        $global = in_array($auth['roleSlug'] ?? null, self::REVIEWER_ROLES, true);
        $company = $this->isForeignCompany($request) && $candidate->company_agency_id === ($auth['agencyId'] ?? null);

        if (! $global && ! $company) {
            throw new ApiException(403, 'Only the foreign company this candidate passed with, '
                .'or the admin side, blocks their other registrations.');
        }

        if (! $candidate->isPassed()) {
            throw new ApiException(409, $candidate->name.' has not passed, so their other registrations stay open.');
        }

        $blocked = (bool) $request->validate(['blocked' => ['required', 'boolean']])['blocked'];

        $other = $candidate->filesElsewhere()->whereKey($otherId)->first();
        if (! $other) {
            throw new ApiException(404, 'That registration is not the same person.');
        }

        $other->update($blocked ? [
            'registration_blocked_at' => now(),
            'registration_blocked_by' => $auth['sub'] ?? null,
            'registration_blocked_for' => $candidate->id,
        ] : [
            'registration_blocked_at' => null,
            'registration_blocked_by' => null,
            'registration_blocked_for' => null,
        ]);

        $where = $other->companyAgency?->name ?? 'the other company';

        return ApiResponse::ok(
            $this->otherRegistrations($request, $candidate),
            $blocked
                ? $candidate->name."'s registration for ".$where.' is blocked.'
                : $candidate->name."'s registration for ".$where.' is open again.'
        );
    }

    /**
     * The foreign company the candidate is registered to be tested for, when
     * one was chosen. Only an active foreign company may be picked, so nobody
     * is registered for one that has been switched off.
     */
    private function companyAgencyId(array $data): ?string
    {
        $id = $data['companyAgencyId'] ?? null;
        if (! $id) {
            return null;
        }

        $company = Agency::find($id);
        if (! $company || ($company->type ?? 'local') !== 'foreign' || $company->status !== 'active') {
            throw new ApiException(422, 'That foreign company was not found.', [
                'companyAgencyId' => 'Choose a foreign company.',
            ]);
        }

        return $company->id;
    }

    /**
     * Sets the file's trades to the list given. A trade the candidate has
     * already been tested for stays, so the test history always names a
     * trade that is on the file.
     */
    private function replaceJobRoles(Candidate $candidate, array $roleIds): void
    {
        // Tested by a coordinator, or given a result by the company.
        $tested = $candidate->tests()->pluck('job_role_id')
            ->merge($candidate->categoryResults()->pluck('job_role_id'))
            ->map(fn ($id) => (int) $id)->all();
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
            // First and last name make up the full name; an older client
            // still sends the full name on its own.
            // Registering needs both halves; an edit may change one of them.
            'firstName' => ['nullable', 'string', 'max:75', ...($request->isMethod('POST') ? ['required_with:lastName'] : [])],
            'lastName' => ['nullable', 'string', 'max:75', ...($request->isMethod('POST') ? ['required_with:firstName'] : [])],
            'name' => [$request->isMethod('POST') ? 'required_without:firstName' : 'sometimes', 'string', 'min:3', 'max:150'],
            'fatherName' => ['nullable', 'string', 'max:150'],
            // Any date is accepted: a passport with little left on it is
            // warned about on every screen, never refused.
            'passportExpiry' => ['nullable', 'date'],
            // Not typed in: it is set to the job category the candidate
            // passes a test in (SkillTestController::result).
            'profession' => ['nullable', 'string', 'max:120'],
            // The foreign company whose test the candidate is registered for:
            // an agency of type foreign, the one that signs in to read them.
            'companyAgencyId' => ['nullable', 'string', 'max:20'],
            'testResults' => ['nullable', 'string', 'max:255'],
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
            'name.required_without' => 'Enter the first and last name.',
            'firstName.required_with' => 'Enter the first name.',
            'lastName.required_with' => 'Enter the last name.',
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
    /**
     * The candidate, if this login may see them. `$forCompany` also lets the
     * foreign company they are registered for read the file - it runs their
     * test - without letting it change anything the agency owns.
     */
    private function find(Request $request, $id, bool $forCompany = false): Candidate
    {
        $candidate = Candidate::find($id);

        if (! $candidate) {
            throw new ApiException(404, 'Candidate not found.');
        }

        $scope = $this->scopeAgencyId($request);
        if ($scope === null || $candidate->agency_id === $scope) {
            return $candidate;
        }

        if ($forCompany && $candidate->isRegisteredWith($scope) && $this->isForeignCompany($request)) {
            return $candidate;
        }

        throw new ApiException(403, 'This candidate belongs to another agency.');
    }
}
