<?php

namespace App\Http\Controllers\Api\Agency;

use App\Enums\DocumentType;
use App\Http\Controllers\Controller;
use App\Models\Candidate;
use App\Models\CandidateDocument;
use App\Services\DocumentStorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

/**
 * Upload, list, download and remove the documents attached to a candidate.
 *
 * Files live on a private disk and are never served from the public directory,
 * so downloads pass back through this controller and its access check.
 */
class CandidateDocumentController extends Controller
{
    public function __construct(private DocumentStorageService $documents) {}

    public function index(Request $request, Candidate $candidate): JsonResponse
    {
        $this->authorizeAccess($request, $candidate);

        return response()->json([
            'success' => true,
            'data' => [
                'documents' => $candidate->documents()->latest()->get(),
                'required' => DocumentType::options(),
                'missing' => $this->documents->missingTypes($candidate),
            ],
        ]);
    }

    /**
     * Attaches one document. Uploading the same type again replaces the file
     * that was there before.
     */
    public function store(Request $request, Candidate $candidate): JsonResponse
    {
        $this->authorizeAccess($request, $candidate);

        $request->validate([
            'type' => ['required', Rule::in(DocumentType::values())],
            'file' => [
                'required',
                'file',
                'max:' . config('documents.max_kb'),
                'mimes:' . implode(',', config('documents.mimes')),
            ],
        ], [
            'file.max' => 'The file may not be larger than ' . round(config('documents.max_kb') / 1024) . ' MB.',
            'file.mimes' => 'Allowed formats: ' . implode(', ', config('documents.mimes')) . '.',
        ]);

        $document = $this->documents->store(
            $candidate,
            DocumentType::from($request->string('type')->toString()),
            $request->file('file'),
            $request->user()->id
        );

        return response()->json([
            'success' => true,
            'message' => $document->type->label() . ' uploaded.',
            'data' => [
                'document' => $document,
                'missing' => $this->documents->missingTypes($candidate->fresh()),
            ],
        ], 201);
    }

    /** Accepts several documents in one request, keyed by document type. */
    public function storeMany(Request $request, Candidate $candidate): JsonResponse
    {
        $this->authorizeAccess($request, $candidate);

        $rules = ['documents' => ['required', 'array', 'min:1']];
        foreach (DocumentType::values() as $type) {
            $rules['documents.' . $type] = [
                'sometimes',
                'file',
                'max:' . config('documents.max_kb'),
                'mimes:' . implode(',', config('documents.mimes')),
            ];
        }
        $request->validate($rules);

        $saved = [];
        foreach ($request->file('documents', []) as $type => $file) {
            if (! in_array($type, DocumentType::values(), true)) {
                continue;
            }
            $saved[] = $this->documents->store($candidate, DocumentType::from($type), $file, $request->user()->id);
        }

        return response()->json([
            'success' => true,
            'message' => count($saved) . ' document(s) uploaded.',
            'data' => [
                'documents' => $saved,
                'missing' => $this->documents->missingTypes($candidate->fresh()),
            ],
        ], 201);
    }

    public function download(Request $request, Candidate $candidate, CandidateDocument $document): StreamedResponse
    {
        $this->authorizeAccess($request, $candidate);
        $this->authorizeDocument($candidate, $document);

        return Storage::disk($document->disk)->download($document->path, $document->original_name);
    }

    public function destroy(Request $request, Candidate $candidate, CandidateDocument $document): JsonResponse
    {
        $this->authorizeAccess($request, $candidate);
        $this->authorizeDocument($candidate, $document);

        $label = $document->type->label();
        $this->documents->delete($document);

        return response()->json([
            'success' => true,
            'message' => $label . ' removed.',
            'data' => ['missing' => $this->documents->missingTypes($candidate->fresh())],
        ]);
    }

    private function authorizeAccess(Request $request, Candidate $candidate): void
    {
        $user = $request->user();

        if ($user->isAgency() && $candidate->agency_id !== $user->agency_id) {
            throw new AccessDeniedHttpException('This candidate belongs to another agency.');
        }
    }

    /** Stops a document id from one candidate being read through another. */
    private function authorizeDocument(Candidate $candidate, CandidateDocument $document): void
    {
        if ($document->candidate_id !== $candidate->id) {
            throw new AccessDeniedHttpException('This document does not belong to that candidate.');
        }
    }
}
