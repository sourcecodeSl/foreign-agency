<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Models\Candidate;
use App\Models\ForeignCompany;
use App\Models\JobRole;
use App\Models\SkillTest;
use App\Support\ApiResponse;
use App\Support\PageAccess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

/**
 * Skill tests: who is being tried for which role, with which foreign company,
 * and how it went.
 *
 * The rules that keep the pool honest all live here:
 *
 *  - one open attempt per candidate; assigning a new one closes the old,
 *    which is how a candidate who failed as a Tiler in the morning can be put
 *    up as a Shuttering Carpenter the same day without a second profile;
 *  - every attempt carries its own test number, so the history reads straight;
 *  - a pass locks the candidate to that foreign company, and no other one can
 *    test them afterwards;
 *  - a fail returns them to the pool, free for any foreign company's next test.
 */
class SkillTestController extends Controller
{
    /** Main Admin and coordinators run tests; agencies only watch their own. */
    private function requireTester(Request $request): void
    {
        $role = $request->attributes->get('auth_user')['roleSlug'] ?? null;

        if (! in_array($role, ['main_admin', PageAccess::ROLE], true)) {
            throw new ApiException(403, 'Only the Main Admin and coordinators can run skill tests.');
        }
    }

    /** Null for a cross-agency role, the caller's own agency otherwise. */
    private function scopeAgencyId(Request $request): ?string
    {
        $auth = $request->attributes->get('auth_user');

        if (in_array($auth['roleSlug'] ?? null, PageAccess::CROSS_AGENCY_ROLES, true)) {
            return null;
        }

        $agencyId = $auth['agencyId'] ?? null;
        if (! $agencyId) {
            throw new ApiException(403, 'Your account is not linked to an agency.');
        }

        return $agencyId;
    }

    /** A coordinator tests only with the foreign companies they manage. */
    private function companyFor(Request $request, $companyId): ForeignCompany
    {
        $company = ForeignCompany::find($companyId);
        if (! $company) {
            throw new ApiException(422, 'That foreign company was not found.', [
                'companyId' => 'Choose a foreign company.',
            ]);
        }

        $auth = $request->attributes->get('auth_user');
        if (($auth['roleSlug'] ?? null) === PageAccess::ROLE
            && (int) $company->coordinator_id !== (int) ($auth['sub'] ?? 0)) {
            throw new ApiException(403, 'That foreign company is managed by another coordinator.');
        }

        if ($company->status !== 'active') {
            throw new ApiException(409, $company->name.' is not active, so it cannot test candidates.');
        }

        return $company;
    }

    private function find(Request $request, string $id): SkillTest
    {
        $test = SkillTest::find($id);
        if (! $test) {
            throw new ApiException(404, 'Test not found.');
        }

        $scope = $this->scopeAgencyId($request);
        if ($scope !== null && $test->agency_id !== $scope) {
            throw new ApiException(403, 'That test belongs to another agency.');
        }

        return $test;
    }

    /** GET /tests?status=&companyId=&candidateId=&agencyId= */
    public function index(Request $request)
    {
        $scope = $this->scopeAgencyId($request);

        $tests = SkillTest::query()
            ->when($scope !== null, fn ($q) => $q->where('agency_id', $scope))
            ->when($request->filled('agencyId') && $scope === null,
                fn ($q) => $q->where('agency_id', $request->query('agencyId')))
            ->when($request->filled('candidateId'), fn ($q) => $q->where('candidate_id', $request->query('candidateId')))
            ->when($request->filled('companyId'), fn ($q) => $q->where('company_id', $request->query('companyId')))
            ->when($request->query('status', 'all') !== 'all', fn ($q) => $q->where('status', $request->query('status')))
            ->with(['candidate', 'company', 'role'])
            ->orderByDesc('id')
            ->get();

        return ApiResponse::ok($tests->map->toPublic()->values());
    }

    /**
     * POST /tests - put a candidate up for a role with a foreign company.
     *
     * The candidate record is never duplicated: a second attempt is a second
     * row here, under a new test number, against the same person.
     */
    public function store(Request $request)
    {
        $this->requireTester($request);

        Validator::make($request->all(), [
            'candidateId' => 'required|integer',
            'companyId' => 'required|integer',
            'jobRoleId' => 'required|integer',
            'scheduledFor' => 'nullable|date',
        ], [
            'candidateId.required' => 'Choose a candidate.',
            'companyId.required' => 'Choose a foreign company.',
            'jobRoleId.required' => 'Choose the job role being tested.',
            'scheduledFor.date' => 'Enter a valid test date.',
        ])->validate();

        $candidate = Candidate::find($request->input('candidateId'));
        if (! $candidate) {
            throw new ApiException(404, 'Candidate not found.');
        }

        $company = $this->companyFor($request, $request->input('companyId'));

        $role = JobRole::where('id', $request->input('jobRoleId'))->where('active', true)->first();
        if (! $role) {
            throw new ApiException(422, 'That job role was not found.', ['jobRoleId' => 'Choose a job role.']);
        }

        // Passing ties a candidate to one foreign company for good; nobody else
        // tests them after that.
        if ($candidate->pool_status === 'passed') {
            // Either a skill test locked them to a foreign company, or their
            // agency switched the pass on itself.
            throw new ApiException(409, $candidate->lockedCompany
                ? $candidate->name.' has already passed for '.$candidate->lockedCompany->name.' and is locked to that foreign company.'
                : $candidate->name.' has already been marked as passed by their agency.');
        }

        // One person, one pass: the same passport may be on file elsewhere.
        if ($candidate->passedElsewhere()) {
            throw new ApiException(409, $candidate->name.' has already passed with another agency.');
        }

        $actor = $request->attributes->get('auth_user')['sub'] ?? null;

        // Whatever is still open is over once this attempt is booked.
        $closed = SkillTest::where('candidate_id', $candidate->id)
            ->where('status', SkillTest::OPEN)
            ->pluck('test_no')
            ->all();

        $test = DB::transaction(function () use ($candidate, $company, $role, $request, $actor) {
            SkillTest::where('candidate_id', $candidate->id)
                ->where('status', SkillTest::OPEN)
                ->update(['status' => 'closed', 'decided_at' => now(), 'decided_by' => $actor]);

            // Tested for a trade not yet on the file: it joins the others,
            // on the same candidate, so nobody has to register them twice.
            $candidate->addJobRoles([$role->id]);

            $test = SkillTest::create([
                'test_no' => SkillTest::nextTestNo(),
                'candidate_id' => $candidate->id,
                'agency_id' => $candidate->agency_id,
                'company_id' => $company->id,
                'job_role_id' => $role->id,
                'scheduled_for' => $request->input('scheduledFor') ?: now()->toDateString(),
                'status' => SkillTest::OPEN,
                'created_by' => $actor,
            ]);

            $candidate->pool_status = 'testing';
            $candidate->save();

            return $test;
        });

        return ApiResponse::created(
            $test->load(['candidate', 'company', 'role'])->toPublic(),
            $candidate->name.' is booked for '.$role->name.' with '.$company->name.' as '.$test->test_no.'.'
                .($closed ? ' '.implode(', ', $closed).(count($closed) === 1 ? ' is' : ' are').' closed.' : '')
        );
    }

    /** PATCH /tests/{id}/result - pass locks the candidate, fail returns them to the pool. */
    public function result(Request $request, string $id)
    {
        $this->requireTester($request);

        Validator::make($request->all(), [
            'result' => 'required|in:pass,fail',
            'note' => 'nullable|string|max:255',
        ], ['result.in' => 'The result is either pass or fail.'])->validate();

        $test = $this->find($request, $id);

        // A coordinator records results only for their own foreign companies.
        $this->companyFor($request, $test->company_id);

        if ($test->status !== SkillTest::OPEN) {
            throw new ApiException(409, 'Test '.$test->test_no.' has already been decided.');
        }

        $passed = $request->input('result') === 'pass';
        $actor = $request->attributes->get('auth_user')['sub'] ?? null;

        // Another agency's file for the same NIC passed while this test was
        // open: this one is blocked, so it cannot pass as well.
        if ($passed && $test->candidate->passedElsewhere()) {
            throw new ApiException(409, $test->candidate->name.' has already passed with another agency, '
                .'so this test cannot be recorded as a pass.');
        }

        DB::transaction(function () use ($test, $passed, $request, $actor) {
            $test->status = $passed ? 'passed' : 'failed';
            $test->result_note = $request->input('note');
            $test->decided_at = now();
            $test->decided_by = $actor;
            $test->save();

            $candidate = $test->candidate;

            if ($passed) {
                // The trade they passed in is what they work as from now on.
                $candidate->profession = $test->role?->name ?: $candidate->profession;
                $candidate->pool_status = 'passed';
                $candidate->locked_company_id = $test->company_id;
                $candidate->locked_at = now();
                $candidate->passed_at = now();
                $candidate->passed_by = $actor;
            } else {
                // Back in the pool, ready for another foreign company's test.
                $candidate->pool_status = 'pool';
            }

            $candidate->save();
        });

        $test->refresh()->load(['candidate', 'company', 'role']);

        return ApiResponse::ok(
            $test->toPublic(),
            $passed
                ? $test->candidate->name.' passed and is now locked to '.$test->company->name.'.'
                : $test->candidate->name.' did not pass and stays in the candidate pool.'
        );
    }
}
