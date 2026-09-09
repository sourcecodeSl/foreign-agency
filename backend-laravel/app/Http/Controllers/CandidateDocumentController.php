<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Models\Candidate;
use App\Models\CandidateDocument;
use App\Support\ApiResponse;
use App\Support\DocumentType;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Upload, list, download and remove the documents attached to a candidate.
 *
 * Files live on a private disk under candidates/{agency}/{candidate} and are
 * never served from the public directory, so downloads pass back through this
 * controller and its ownership check.
 */
class CandidateDocumentController extends Controller
{
    private const GLOBAL_ROLES = ['main_admin', 'auditor'];

    /** GET /candidates/{id}/documents */
    public function index(Request $request, $candidateId)
    {
        $candidate = $this->find($request, $candidateId);

        return ApiResponse::ok([
            'documents' => $candidate->documents()->orderByDesc('id')->get()->map->toPublic()->all(),
            'required' => DocumentType::options(),
            'missing' => $candidate->missingDocumentTypes(),
        ]);
    }

    /**
     * POST /candidates/{id}/documents
     * Uploading the same type again replaces the previous file.
     */
    public function store(Request $request, $candidateId)
    {
        $candidate = $this->find($request, $candidateId);

        $request->validate([
            'type' => ['required', Rule::in(DocumentType::values())],
            'file' => [
                'required',
                'file',
                'max:'.config('documents.max_kb'),
                'mimes:'.implode(',', config('documents.mimes')),
            ],
        ], [
            'file.max' => 'The file may not be larger than '.round(config('documents.max_kb') / 1024).' MB.',
            'file.mimes' => 'Allowed formats: '.implode(', ', config('documents.mimes')).'.',
        ]);

        $document = $this->save(
            $candidate,
            DocumentType::from($request->input('type')),
            $request->file('file'),
            $request->attributes->get('auth_user')['sub'] ?? null
        );

        return ApiResponse::created([
            'document' => $document->toPublic(),
            'missing' => $candidate->fresh()->missingDocumentTypes(),
        ], $document->typeLabel().' uploaded.');
    }

    /**
     * POST /candidates/{id}/documents/bulk
     * Accepts several files at once, keyed by document type.
     */
    public function storeMany(Request $request, $candidateId)
    {
        $candidate = $this->find($request, $candidateId);

        $rules = ['documents' => ['required', 'array', 'min:1']];
        foreach (DocumentType::values() as $type) {
            $rules['documents.'.$type] = [
                'sometimes',
                'file',
                'max:'.config('documents.max_kb'),
                'mimes:'.implode(',', config('documents.mimes')),
            ];
        }
        $request->validate($rules);

        $userId = $request->attributes->get('auth_user')['sub'] ?? null;
        $saved = [];

        foreach ((array) $request->file('documents', []) as $type => $file) {
            $documentType = DocumentType::tryFrom((string) $type);
            if (! $documentType) {
                continue;
            }
            $saved[] = $this->save($candidate, $documentType, $file, $userId)->toPublic();
        }

        return ApiResponse::created([
            'documents' => $saved,
            'missing' => $candidate->fresh()->missingDocumentTypes(),
        ], count($saved).' document(s) uploaded.');
    }

    /** GET /candidates/{id}/documents/{documentId}/download */
    public function download(Request $request, $candidateId, $documentId)
    {
        $candidate = $this->find($request, $candidateId);
        $document = $this->findDocument($candidate, $documentId);

        return Storage::disk($document->disk)->download($document->path, $document->original_name);
    }

    /** DELETE /candidates/{id}/documents/{documentId} */
    public function destroy(Request $request, $candidateId, $documentId)
    {
        $candidate = $this->find($request, $candidateId);
        $document = $this->findDocument($candidate, $documentId);

        $label = $document->typeLabel();
        $document->deleteFile();
        $document->delete();

        return ApiResponse::ok(
            ['missing' => $candidate->fresh()->missingDocumentTypes()],
            $label.' removed.'
        );
    }

    // ---------------------------------------------------------------------

    private function save(Candidate $candidate, DocumentType $type, $file, $userId): CandidateDocument
    {
        $disk = config('documents.disk');
        $directory = 'candidates/'.$candidate->agency_id.'/'.$candidate->id;
        $filename = $type->value.'-'.Str::uuid().'.'.$file->getClientOriginalExtension();

        $path = $file->storeAs($directory, $filename, ['disk' => $disk]);

        return DB::transaction(function () use ($candidate, $type, $file, $userId, $disk, $path) {
            $existing = $candidate->documents()->where('type', $type->value)->first();

            $attributes = [
                'disk' => $disk,
                'path' => $path,
                'original_name' => $file->getClientOriginalName(),
                'mime_type' => $file->getClientMimeType(),
                'size_bytes' => $file->getSize(),
                'uploaded_by' => $userId,
            ];

            if ($existing) {
                $oldPath = $existing->path;
                $existing->update($attributes);
                // Drop the superseded file only once the row points at the new one.
                if ($oldPath !== $path) {
                    Storage::disk($disk)->delete($oldPath);
                }

                return $existing->fresh();
            }

            return CandidateDocument::create([
                'candidate_id' => $candidate->id,
                'type' => $type->value,
            ] + $attributes);
        });
    }

    private function find(Request $request, $id): Candidate
    {
        $candidate = Candidate::find($id);

        if (! $candidate) {
            throw new ApiException(404, 'Candidate not found.');
        }

        $auth = $request->attributes->get('auth_user');
        if (in_array($auth['roleSlug'] ?? null, self::GLOBAL_ROLES, true)) {
            return $candidate;
        }

        if ($candidate->agency_id !== ($auth['agencyId'] ?? null)) {
            throw new ApiException(403, 'This candidate belongs to another agency.');
        }

        return $candidate;
    }

    /** Stops a document id from one candidate being read through another. */
    private function findDocument(Candidate $candidate, $documentId): CandidateDocument
    {
        $document = CandidateDocument::find($documentId);

        if (! $document || $document->candidate_id !== $candidate->id) {
            throw new ApiException(404, 'Document not found for this candidate.');
        }

        return $document;
    }
}
