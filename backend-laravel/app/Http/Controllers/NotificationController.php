<?php

namespace App\Http\Controllers;

use App\Models\Agency;
use App\Models\Candidate;
use App\Support\ApiResponse;
use Carbon\Carbon;
use Illuminate\Http\Request;

/**
 * GET /notifications - what the bell in the top bar lists.
 *
 * Built from records the system already keeps rather than a table of its own:
 * each item is something waiting on, or that just happened to, the person
 * signed in. The client remembers which ones it has already shown.
 */
class NotificationController extends Controller
{
    /** Roles that are not tied to a single agency. */
    private const GLOBAL_ROLES = ['main_admin', 'auditor'];

    private const LIMIT = 15;

    public function index(Request $request)
    {
        $auth = $request->attributes->get('auth_user');

        $items = in_array($auth['roleSlug'] ?? null, self::GLOBAL_ROLES, true)
            ? $this->forAdministrator()
            : $this->forAgency((string) ($auth['agencyId'] ?? ''));

        // Newest first, whichever kind of record each item came from.
        usort($items, fn ($a, $b) => strtotime((string) $b['at']) <=> strtotime((string) $a['at']));

        return ApiResponse::ok(array_slice($items, 0, self::LIMIT));
    }

    private function iso($value): ?string
    {
        return $value ? Carbon::parse($value)->toIso8601String() : null;
    }

    /** Agencies to approve, and candidate files arriving from every agency. */
    private function forAdministrator(): array
    {
        $items = [];

        foreach (Agency::where('status', 'pending')->orderByDesc('id')->limit(self::LIMIT)->get() as $agency) {
            $items[] = [
                'id' => 'agency-pending-'.$agency->id,
                'tone' => 'warning',
                'title' => $agency->name.' is awaiting approval',
                'body' => 'New agency registration. Contact: '.$agency->contact.'.',
                'at' => $this->iso($agency->created_at),
                'link' => '/agencies',
            ];
        }

        $candidates = Candidate::query()
            ->where(fn ($q) => $q->where('status', 'submitted')
                ->orWhere('created_at', '>=', now()->subDays(7)))
            ->orderByDesc('updated_at')
            ->limit(self::LIMIT)
            ->get();

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
                'id' => 'candidate-decided-'.$candidate->id,
                'tone' => $approved ? 'success' : 'danger',
                'title' => $candidate->name.' was '.($approved ? 'approved' : 'rejected'),
                'body' => $approved
                    ? 'The administrator approved this candidate file.'
                    : 'The administrator rejected this file. Open it to review.',
                'at' => $this->iso($candidate->updated_at),
                'link' => '/candidates/'.$candidate->id,
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
                'id' => 'candidate-missing-'.$candidate->id,
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
