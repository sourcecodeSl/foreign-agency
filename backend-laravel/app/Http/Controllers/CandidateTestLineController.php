<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Models\Agency;
use App\Models\Candidate;
use App\Models\CandidateTestLine;
use App\Support\ApiResponse;
use App\Support\PageAccess;
use Illuminate\Http\Request;

/**
 * A candidate's test document, line by line.
 *
 *   company  a foreign company the candidate is approved with adds lines -
 *            and only adds: nothing it wrote is changed or taken back. It
 *            reads the lines it wrote itself, never another company's.
 *   agency   the local agency that owns the candidate reads every line and
 *            is told of each new one (NotificationController). It writes none.
 *   admin    the Main Admin, coordinators and the auditor read every line.
 *
 * The lines belong to the candidate, so they follow them from company to
 * company and last as long as the file does.
 */
class CandidateTestLineController extends Controller
{
    private const MAX_LINE = 1000;

    /** Who is asking, as [side, own agency or null]. */
    private function viewer(Request $request): array
    {
        $auth = $request->attributes->get('auth_user');

        if (in_array($auth['roleSlug'] ?? null, PageAccess::CROSS_AGENCY_ROLES, true)) {
            return ['admin', null];
        }

        $agency = ($auth['agencyId'] ?? null) ? Agency::find($auth['agencyId']) : null;
        if (! $agency) {
            throw new ApiException(403, 'Only agencies, companies and the admin side read test documents.');
        }

        return [($agency->type ?? 'local') === 'foreign' ? 'company' : 'agency', $agency];
    }

    private function candidate(string $id): Candidate
    {
        $candidate = Candidate::with('registrations')->find($id);
        if (! $candidate) {
            throw new ApiException(404, 'Candidate not found.');
        }

        return $candidate;
    }

    /** Whether this company may add a line: the candidate is approved for its test. */
    private function canAdd(string $side, ?Agency $agency, Candidate $candidate): bool
    {
        return $side === 'company' && $candidate->isApprovedWith($agency->id);
    }

    /** GET /candidates/{id}/test-lines */
    public function index(Request $request, string $id)
    {
        [$side, $agency] = $this->viewer($request);
        $candidate = $this->candidate($id);

        $lines = CandidateTestLine::where('candidate_id', $candidate->id)->with(['company', 'recorder']);

        if ($side === 'agency' && $candidate->agency_id !== $agency->id) {
            throw new ApiException(403, 'This candidate belongs to another agency.');
        }

        if ($side === 'company') {
            $wrote = CandidateTestLine::where('candidate_id', $candidate->id)
                ->where('company_agency_id', $agency->id)->exists();

            // Its own candidates, and any it wrote about before they moved on.
            if (! $candidate->isVisibleToCompany($agency->id) && ! $wrote) {
                throw new ApiException(403, 'This candidate is not registered with your company.');
            }
            $lines->where('company_agency_id', $agency->id);
        }

        return ApiResponse::ok([
            'candidate' => ['id' => $candidate->id, 'name' => $candidate->name],
            'lines' => $lines->orderBy('id')->get()->map(fn (CandidateTestLine $l) => $l->toPublic())->values(),
            'canAdd' => $this->canAdd($side, $agency, $candidate),
        ]);
    }

    /** POST /candidates/{id}/test-lines { body } - the testing company adds one line. */
    public function store(Request $request, string $id)
    {
        [$side, $agency] = $this->viewer($request);
        $candidate = $this->candidate($id);

        if ($side !== 'company') {
            throw new ApiException(403, 'Only the foreign company testing this candidate adds test lines.');
        }
        if (! $this->canAdd($side, $agency, $candidate)) {
            throw new ApiException(403, 'This candidate is not approved for your company\'s test.');
        }

        $data = $request->validate([
            'body' => ['required', 'string', 'max:'.self::MAX_LINE],
        ], [
            'body.required' => 'Write the test line first.',
        ]);

        $body = trim($data['body']);
        if ($body === '') {
            throw new ApiException(422, 'Write the test line first.', ['body' => 'Write the test line first.']);
        }

        $line = CandidateTestLine::create([
            'candidate_id' => $candidate->id,
            'company_agency_id' => $agency->id,
            'body' => $body,
            'recorded_by' => $request->attributes->get('auth_user')['sub'] ?? null,
        ]);

        return ApiResponse::created(
            $line->load(['company', 'recorder'])->toPublic(),
            'Test line saved. '.(Agency::where('id', $candidate->agency_id)->value('name') ?? 'The agency')
                .' has been notified.'
        );
    }
}
