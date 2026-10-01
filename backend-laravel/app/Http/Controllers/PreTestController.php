<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Models\Agency;
use App\Models\Candidate;
use App\Models\CandidatePreTest;
use App\Models\CandidateRegistration;
use App\Models\JobRole;
use App\Models\Role;
use App\Support\ApiResponse;
use App\Support\PageAccess;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The local agency's pre-test, before any foreign company's final test.
 *
 * The agency that registered the candidate books a pre-test in one job
 * category - which issues its pre-test index number, PRE-TL00001 - then
 * records pass or fail. A fail may be booked again under a new number; the
 * latest attempt is what counts. Only a pass lets the admin side send the
 * candidate to a company for that category (Candidate::requirePreTestPass).
 *
 * Foreign companies have no part in it. The admin side reads every agency's.
 */
class PreTestController extends Controller
{
    /** The tabs on the pre-tests page: where the latest attempt stands. */
    private const STATUSES = ['none', 'pending', 'pass', 'fail'];

    /** [isAdminSide, own agency id or null]. */
    private function viewer(Request $request): array
    {
        $auth = $request->attributes->get('auth_user');

        if (in_array($auth['roleSlug'] ?? null, PageAccess::CROSS_AGENCY_ROLES, true)) {
            return [true, null];
        }

        $agency = ($auth['agencyId'] ?? null) ? Agency::find($auth['agencyId']) : null;
        if (! $agency || ($agency->type ?? 'local') === 'foreign') {
            throw new ApiException(403, 'Pre-tests are run by the local agency that registered the candidate.');
        }

        return [false, $agency->id];
    }

    /**
     * The candidate, for the local agency that owns them and may edit its
     * candidates - the only one that books and records their pre-tests.
     */
    private function ownCandidate(Request $request, string $id): Candidate
    {
        [$admin, $agencyId] = $this->viewer($request);
        if ($admin) {
            throw new ApiException(403, 'The local agency that registered the candidate runs the pre-test.');
        }

        $role = $request->attributes->get('auth_user')['roleSlug'] ?? null;
        if (! (Role::where('slug', $role)->first()?->permissions['candidates']['edit'] ?? false)) {
            throw new ApiException(403, 'You do not have permission to record pre-tests.');
        }

        $candidate = Candidate::with(['jobRoles', 'preTests'])->find($id);
        if (! $candidate) {
            throw new ApiException(404, 'Candidate not found.');
        }
        if ($candidate->agency_id !== $agencyId) {
            throw new ApiException(403, 'This candidate belongs to another agency.');
        }
        if ($candidate->isBlocked()) {
            throw new ApiException(409, $candidate->name.' has passed with another agency, so this file is closed.');
        }

        return $candidate;
    }

    /**
     * GET /pre-tests?status=&jobRoleId=&search=&agencyId=
     *
     * One row per candidate and job category on the file, with where its
     * pre-test stands. status=pass is the list of those eligible for the
     * final test. An agency reads its own; the admin side reads any.
     */
    public function index(Request $request)
    {
        [$admin, $agencyId] = $this->viewer($request);
        $agencyId = $admin ? ($request->query('agencyId') ?: null) : $agencyId;

        $candidates = Candidate::query()
            ->when($agencyId, fn ($q) => $q->where('agency_id', $agencyId))
            ->search($request->query('search'))
            ->with(['jobRoles', 'preTests.role', 'preTests.recorder', 'preTests.booker'])
            ->orderByDesc('id')
            ->get();

        $agencies = Agency::whereIn('id', $candidates->pluck('agency_id')->unique())->pluck('name', 'id');
        $roleFilter = (int) $request->query('jobRoleId', 0);

        $rows = [];
        foreach ($candidates as $candidate) {
            $latest = $candidate->latestPreTests();
            $attempts = $candidate->preTests->countBy('job_role_id');

            foreach ($candidate->jobRoles as $role) {
                if ($roleFilter && $role->id !== $roleFilter) {
                    continue;
                }
                $test = $latest[$role->id] ?? null;

                $rows[] = [
                    'key' => $candidate->id.'-'.$role->id,
                    'candidate' => [
                        'id' => $candidate->id,
                        'name' => $candidate->name,
                        'passportNo' => $candidate->passport_no,
                        'nicNo' => $candidate->nic_no,
                        'blocked' => $candidate->isBlocked(),
                    ],
                    'agencyId' => $candidate->agency_id,
                    'agencyName' => $agencies[$candidate->agency_id] ?? $candidate->agency_id,
                    'jobRole' => ['id' => $role->id, 'name' => $role->name],
                    'status' => $test?->result ?? 'none',
                    'attempts' => (int) ($attempts[$role->id] ?? 0),
                    'latest' => $test?->toPublic(),
                ];
            }
        }

        $counts = array_fill_keys(self::STATUSES, 0);
        foreach ($rows as $row) {
            $counts[$row['status']]++;
        }

        $status = $request->query('status');
        if (in_array($status, self::STATUSES, true)) {
            $rows = array_values(array_filter($rows, fn ($row) => $row['status'] === $status));
        }

        return ApiResponse::ok(['rows' => $rows, 'counts' => $counts + ['all' => array_sum($counts)]]);
    }

    /** GET /candidates/{id}/pre-tests - every attempt, oldest first. */
    public function history(Request $request, string $id)
    {
        [$admin, $agencyId] = $this->viewer($request);

        $candidate = Candidate::with(['jobRoles', 'preTests.role', 'preTests.booker', 'preTests.recorder'])->find($id);
        if (! $candidate || (! $admin && $candidate->agency_id !== $agencyId)) {
            throw new ApiException(404, 'Candidate not found.');
        }

        return ApiResponse::ok([
            'summary' => $candidate->preTestSummary(),
            'attempts' => $candidate->preTests->map(fn (CandidatePreTest $t) => $t->toPublic())->values(),
        ]);
    }

    /**
     * POST /candidates/{id}/pre-tests { jobRoleId }
     *
     * Books the pre-test in one of the candidate's job categories and issues
     * its index number. Again after a fail; never while one waits for its
     * result, nor once passed.
     */
    public function store(Request $request, string $id)
    {
        $candidate = $this->ownCandidate($request, $id);

        $data = $request->validate([
            'jobRoleId' => ['required', 'integer'],
        ], ['jobRoleId.required' => 'Choose the job category.']);

        $role = $candidate->jobRoles->firstWhere('id', (int) $data['jobRoleId']);
        if (! $role) {
            $message = 'That job category is not on '.$candidate->name.'\'s file.';
            throw new ApiException(422, $message, ['jobRoleId' => $message]);
        }

        $latest = $candidate->latestPreTests()[$role->id] ?? null;
        if ($latest?->result === CandidatePreTest::PENDING) {
            throw new ApiException(409, $candidate->name.' already has pre-test '.$latest->index_no.' in '.$role->name
                .' waiting for its result.');
        }
        if ($latest?->result === CandidatePreTest::PASS) {
            throw new ApiException(409, $candidate->name.' has already passed the pre-test in '.$role->name.'.');
        }

        $test = CandidatePreTest::create([
            'candidate_id' => $candidate->id,
            'job_role_id' => $role->id,
            'index_no' => JobRole::findOrFail($role->id)->nextPreTestIndex(),
            'result' => CandidatePreTest::PENDING,
            'booked_by' => $request->attributes->get('auth_user')['sub'] ?? null,
        ]);

        return ApiResponse::created(
            $test->load(['role', 'booker'])->toPublic(),
            ($latest ? 'Retake booked' : 'Pre-test booked').' for '.$candidate->name.' in '.$role->name.': '.$test->index_no.'.'
        );
    }

    /** The latest attempt in its category - the only one that is ever changed. */
    private function latestAttempt(Candidate $candidate, string $testId): CandidatePreTest
    {
        $test = $candidate->preTests->firstWhere('id', (int) $testId);
        if (! $test) {
            throw new ApiException(404, 'That pre-test was not found on this candidate.');
        }

        if (($candidate->latestPreTests()[$test->job_role_id] ?? null)?->id !== $test->id) {
            throw new ApiException(409, 'Only the latest pre-test in a category can be changed.');
        }

        return $test;
    }

    /**
     * PATCH /candidates/{id}/pre-tests/{testId} { result: pass|fail, note? }
     *
     * The result of the latest attempt, while it waits for one. A result
     * given by mistake is rewound first.
     */
    public function record(Request $request, string $id, string $testId)
    {
        $candidate = $this->ownCandidate($request, $id);

        $data = $request->validate([
            'result' => ['required', Rule::in([CandidatePreTest::PASS, CandidatePreTest::FAIL])],
            'note' => ['nullable', 'string', 'max:255'],
        ], ['result.in' => 'The result is either pass or fail.']);

        $test = $this->latestAttempt($candidate, $testId);
        $role = $test->role?->name ?? 'this category';

        if ($test->result !== CandidatePreTest::PENDING) {
            throw new ApiException(409, 'Pre-test '.$test->index_no.' already has its result. Rewind it to change it.');
        }

        $test->update([
            'result' => $data['result'],
            'note' => isset($data['note']) ? trim($data['note']) ?: null : null,
            'recorded_by' => $request->attributes->get('auth_user')['sub'] ?? null,
            'recorded_at' => now(),
        ]);

        return ApiResponse::ok(
            $test->load(['role', 'booker', 'recorder'])->toPublic(),
            $data['result'] === CandidatePreTest::PASS
                ? $candidate->name.' passed pre-test '.$test->index_no.' in '.$role.' and is eligible for the final test.'
                : $candidate->name.' did not pass pre-test '.$test->index_no.' in '.$role.'. A retake can be issued.'
        );
    }

    /**
     * POST /candidates/{id}/pre-tests/{testId}/rewind
     *
     * Takes back the result of the latest attempt - a pass or a fail - so it
     * waits for its result again, under the same index number. Rewinding a
     * pass takes the candidate off the eligible list in that category.
     */
    public function rewind(Request $request, string $id, string $testId)
    {
        $candidate = $this->ownCandidate($request, $id);
        $test = $this->latestAttempt($candidate, $testId);
        $role = $test->role?->name ?? 'this category';

        if ($test->result === CandidatePreTest::PENDING) {
            throw new ApiException(409, 'Pre-test '.$test->index_no.' has no result to rewind.');
        }

        $test->update([
            'result' => CandidatePreTest::PENDING,
            'note' => null,
            'recorded_by' => null,
            'recorded_at' => null,
        ]);

        return ApiResponse::ok(
            $test->load(['role', 'booker'])->toPublic(),
            'Pre-test '.$test->index_no.' for '.$candidate->name.' in '.$role.' is waiting for its result again.'
        );
    }
}
