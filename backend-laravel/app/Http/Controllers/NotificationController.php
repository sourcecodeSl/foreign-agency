<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Models\Agency;
use App\Models\Candidate;
use App\Models\CandidateTestResult;
use App\Models\User;
use App\Support\ApiResponse;
use App\Support\PageAccess;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * GET /notifications - what the bell in the top bar lists.
 *
 * Built from records the system already keeps rather than a table of its own:
 * each item is something waiting on, or that just happened to, the person
 * signed in. The ones a login has opened are kept in notification_dismissals
 * and left off its list.
 */
class NotificationController extends Controller
{
    /** Roles that are not tied to a single agency. */
    private const GLOBAL_ROLES = PageAccess::CROSS_AGENCY_ROLES;

    private const LIMIT = 15;

    public function index(Request $request)
    {
        $auth = $request->attributes->get('auth_user');

        $items = in_array($auth['roleSlug'] ?? null, self::GLOBAL_ROLES, true)
            ? $this->forAdministrator($request->attributes->get('auth_account'))
            : $this->forAgency((string) ($auth['agencyId'] ?? ''));

        // Whatever this login has already opened stays off the bell.
        $dismissed = DB::table('notification_dismissals')
            ->where('user_id', $auth['sub'] ?? 0)
            ->pluck('notification_id')
            ->flip();
        $items = array_values(array_filter($items, fn ($item) => ! isset($dismissed[$item['id']])));

        // Newest first, whichever kind of record each item came from.
        usort($items, fn ($a, $b) => strtotime((string) $b['at']) <=> strtotime((string) $a['at']));

        return ApiResponse::ok(array_slice($items, 0, self::LIMIT));
    }

    /**
     * POST /notifications/{id}/dismiss - the person opened it, so the bell
     * no longer lists it. Recording the same one twice is harmless.
     */
    public function dismiss(Request $request, string $id)
    {
        if (strlen($id) > 120) {
            throw new ApiException(422, 'That notification was not found.');
        }

        DB::table('notification_dismissals')->insertOrIgnore([
            'user_id' => $request->attributes->get('auth_user')['sub'] ?? 0,
            'notification_id' => $id,
            'created_at' => now(),
        ]);

        return ApiResponse::ok(['id' => $id]);
    }

    private function iso($value): ?string
    {
        return $value ? Carbon::parse($value)->toIso8601String() : null;
    }

    /**
     * Agencies to approve, and candidate files arriving from every agency. A
     * coordinator hears only about what the pages opened to them can act on.
     */
    private function forAdministrator(?User $account): array
    {
        $limited = $account?->role_slug === PageAccess::ROLE;
        $pages = $limited ? $account->pageAccess() : [];
        $items = [];

        $pending = ! $limited || in_array('agencies', $pages, true)
            ? Agency::where('status', 'pending')->orderByDesc('id')->limit(self::LIMIT)->get()
            : collect();

        foreach ($pending as $agency) {
            $items[] = [
                'id' => 'agency-pending-'.$agency->id,
                'tone' => 'warning',
                'title' => $agency->name.' is awaiting approval',
                'body' => 'New agency registration. Contact: '.$agency->contact.'.',
                'at' => $this->iso($agency->created_at),
                'link' => '/agencies',
            ];
        }

        $candidates = ! $limited || in_array('candidates', $pages, true)
            ? Candidate::query()
                ->where(fn ($q) => $q->where('status', 'submitted')
                    ->orWhere('created_at', '>=', now()->subDays(7)))
                ->orderByDesc('updated_at')
                ->limit(self::LIMIT)
                ->get()
            : collect();

        $agencies = Agency::whereIn('id', $candidates->pluck('agency_id')->unique())->pluck('name', 'id');

        foreach ($candidates as $candidate) {
            $agency = $agencies[$candidate->agency_id] ?? 'an agency';
            $submitted = $candidate->status === 'submitted';

            $items[] = [
                'id' => 'candidate-'.($submitted ? 'submitted' : 'new').'-'.$candidate->id,
                'tone' => $submitted ? 'info' : 'neutral',
                'title' => $submitted
                    ? $candidate->name.' was submitted for review'
                    : 'New candidate: '.$candidate->name,
                'body' => ($submitted ? 'From ' : 'Registered by ').$agency.'.',
                'at' => $this->iso($submitted ? $candidate->updated_at : $candidate->created_at),
                'link' => '/candidates/'.$candidate->id,
            ];
        }

        return $items;
    }

    /** The signed-in agency's own files: what was decided, and what still needs doing. */
    private function forAgency(string $agencyId): array
    {
        if ($agencyId === '') {
            return [];
        }

        $items = [];

        $agency = Agency::find($agencyId);
        if ($agency && $agency->status === 'active' && $agency->status_changed_at
            && Carbon::parse($agency->status_changed_at)->gte(now()->subDays(14))) {
            $items[] = [
                'id' => 'agency-active-'.$agency->id,
                'tone' => 'success',
                'title' => 'Your agency is now active',
                'body' => 'You can register candidates and attach their documents.',
                'at' => $this->iso($agency->status_changed_at),
                'link' => '/candidates',
            ];
        }

        $decided = Candidate::where('agency_id', $agencyId)
            ->whereIn('status', ['approved', 'rejected'])
            ->orderByDesc('updated_at')
            ->limit(self::LIMIT)
            ->get();

        foreach ($decided as $candidate) {
            $approved = $candidate->status === 'approved';

            $items[] = [
                // The status is in the id, so a new decision shows again.
                'id' => 'candidate-decided-'.$candidate->id.'-'.$candidate->status,
                'tone' => $approved ? 'success' : 'danger',
                'title' => $candidate->name.' was '.($approved ? 'approved' : 'rejected'),
                'body' => $approved
                    ? 'The administrator approved this candidate file.'
                    : 'The administrator rejected this file. Open it to review.',
                'at' => $this->iso($candidate->updated_at),
                'link' => '/candidates/'.$candidate->id,
            ];
        }

        // Results the foreign company recorded, one per job category - a fail
        // as much as a pass, so the agency knows where each candidate stands.
        $results = CandidateTestResult::query()
            ->whereIn('candidate_id', Candidate::where('agency_id', $agencyId)->select('id'))
            ->where('updated_at', '>=', now()->subDays(14))
            ->with(['candidate', 'role', 'company'])
            ->orderByDesc('updated_at')
            ->limit(self::LIMIT)
            ->get();

        foreach ($results as $result) {
            if (! $result->candidate) {
                continue;
            }

            $passed = $result->result === 'pass';
            $company = $result->company?->name ?? 'The foreign company';

            $items[] = [
                'id' => 'candidate-result-'.$result->id.'-'.$result->result,
                'tone' => $passed ? 'success' : 'danger',
                'title' => $result->candidate->name.($passed ? ' passed as ' : ' did not pass as ')
                    .($result->role?->name ?? 'a job category'),
                'body' => $company.' recorded the result'.($result->note ? ': '.$result->note : '.'),
                'at' => $this->iso($result->updated_at),
                'link' => '/candidates/'.$result->candidate_id,
            ];
        }

        $drafts = Candidate::where('agency_id', $agencyId)
            ->where('status', 'draft')
            ->orderByDesc('updated_at')
            ->limit(self::LIMIT)
            ->get();

        foreach ($drafts as $candidate) {
            $missing = count($candidate->missingDocumentTypes());

            $items[] = [
                // The count is in the id, so dismissing "missing 8" does not
                // hide "ready to submit" later on.
                'id' => 'candidate-missing-'.$candidate->id.'-'.$missing,
                'tone' => $missing > 0 ? 'warning' : 'info',
                'title' => $missing > 0
                    ? $candidate->name.' is missing '.$missing.' document'.($missing === 1 ? '' : 's')
                    : $candidate->name.' is ready to submit',
                'body' => $missing > 0
                    ? 'Attach them to submit the file for review.'
                    : 'Every required document is attached.',
                'at' => $this->iso($candidate->updated_at),
                'link' => '/candidates/'.$candidate->id,
            ];
        }

        return $items;
    }
}
