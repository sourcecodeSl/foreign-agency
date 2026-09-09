<?php

namespace App\Http\Controllers\Api\Agency;

use App\Enums\DocumentType;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreCandidateRequest;
use App\Models\Candidate;
use App\Services\DocumentStorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

/**
 * Candidate registration, performed by an agency.
 *
 * Candidates do not log in, so nothing here touches passwords or OTP. Every
 * query is scoped to the agency that owns the record; a Main Admin can read
 * across agencies.
 */
class CandidateController extends Controller
{
    public function __construct(private DocumentStorageService $documents) {}

    public function index(Request $request): JsonResponse
    {
        $candidates = Candidate::query()
            ->forAgency($this->scopeAgencyId($request))
            ->search($request->query('search'))
            ->when($request->query('status', 'all') !== 'all',
                fn ($q) => $q->where('status', $request->query('status')))
            ->with(['documents:id,candidate_id,type,original_name,size_bytes,created_at'])
            ->withCount('documents')
            ->latest()
            ->paginate((int) $request->query('per_page', 15))
            ->withQueryString();

        return response()->json([
            'success' => true,
            'data' => $candidates->items(),
            'meta' => [
                'current_page' => $candidates->currentPage(),
                'last_page' => $candidates->lastPage(),
                'per_page' => $candidates->perPage(),
                'total' => $candidates->total(),
            ],
        ]);
    }

    public function show(Request $request, Candidate $candidate): JsonResponse
    {
        $this->authorizeAccess($request, $candidate);

        $candidate->load('documents', 'agency:id,code,name');

        return $this->ok([
            'candidate' => $candidate,
            'missing_documents' => $this->documents->missingTypes($candidate),
        ]);
    }

    public function store(StoreCandidateRequest $request): JsonResponse
    {
        $agencyId = $request->agencyId();

        if (! $agencyId) {
            return response()->json([
                'success' => false,
                'message' => 'An agency must be specified for this candidate.',
            ], 422);
        }

        $candidate = Candidate::create([
            ...$request->validated(),
            'agency_id' => $agencyId,
            'status' => 'draft',
            'created_by' => $request->user()->id,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Candidate registered. You can now attach the required documents.',
            'data' => [
                'candidate' => $candidate->load('documents'),
                'required_documents' => DocumentType::options(),
            ],
        ], 201);
    }

    public function update(StoreCandidateRequest $request, Candidate $candidate): JsonResponse
    {
        $this->authorizeAccess($request, $candidate);

        $candidate->update($request->validated());

        return $this->ok($candidate->fresh()->load('documents'), 'Candidate updated.');
    }

    public function updateStatus(Request $request, Candidate $candidate): JsonResponse
    {
        $this->authorizeAccess($request, $candidate);

        $data = $request->validate([
            'status' => ['required', Rule::in(['draft', 'submitted', 'approved', 'rejected'])],
        ]);

        // A file set must be complete before it goes forward for review.
        if ($data['status'] === 'submitted') {
            $missing = $this->documents->missingTypes($candidate);
            if ($missing !== []) {
                return response()->json([
                    'success' => false,
                    'message' => 'Upload every required document before submitting.',
                    'errors' => ['documents' => $missing],
                ], 422);
            }
        }

        $candidate->update(['status' => $data['status']]);

        return $this->ok($candidate->fresh(), 'Candidate marked as ' . $data['status'] . '.');
    }

    public function destroy(Request $request, Candidate $candidate): JsonResponse
    {
        $this->authorizeAccess($request, $candidate);

        $candidate->delete();   // soft delete; files are kept

        return $this->ok(['id' => $candidate->id], 'Candidate removed.');
    }

    /** The checklist the registration screen renders. */
    public function documentTypes(): JsonResponse
    {
        return $this->ok(DocumentType::options());
    }

    /** Null for a Main Admin (sees everything), the own id for an agency. */
    private function scopeAgencyId(Request $request): ?int
    {
        return $request->user()->isAgency() ? $request->user()->agency_id : null;
    }

    /** An agency may only ever touch its own candidates. */
    private function authorizeAccess(Request $request, Candidate $candidate): void
    {
        $user = $request->user();

        if ($user->isAgency() && $candidate->agency_id !== $user->agency_id) {
            throw new AccessDeniedHttpException('This candidate belongs to another agency.');
        }
    }

    private function ok(mixed $data, ?string $message = null): JsonResponse
    {
        return response()->json(['success' => true, 'data' => $data, 'message' => $message]);
    }
}
