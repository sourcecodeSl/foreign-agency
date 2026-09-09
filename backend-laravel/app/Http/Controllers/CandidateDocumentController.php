<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Models\Candidate;
use App\Models\CandidateDocument;
use App\Support\ApiResponse;
use App\Support\DocumentType;
use App\Support\ZipStream;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Documents attached to a candidate.
 *
 * Uploads are append-only: nothing is ever replaced or deleted, so attaching
 * the same type three times leaves three rows and the newest one is the
 * current file. There is deliberately no delete action.
 *
 * Files live on a private disk under candidates/{agency}/{candidate} and are
 * never served from the public directory, so every read passes back through
 * this controller and its ownership check.
 */
class CandidateDocumentController extends Controller
{
    private const GLOBAL_ROLES = ['main_admin', 'auditor'];

    /** GET /candidates/{id}/documents */
    public function index(Request $request, $candidateId)
    {
        $candidate = $this->find($request, $candidateId);
        $latest = $candidate->latestDocumentsByType();

        return ApiResponse::ok([
            // Every upload, newest first, with the current one flagged.
            'documents' => $candidate->documents()->orderByDesc('id')->get()
                ->map(fn ($d) => $d->toPublic() + [
                    'isLatest' => isset($latest[$d->type]) && $latest[$d->type]->id === $d->id,
                ])->all(),
            'latest' => array_map(fn ($d) => $d->toPublic(), $latest),
            'required' => DocumentType::options(),
            'missing' => $candidate->missingDocumentTypes(),
        ]);
    }

    /** GET /candidates/{id}/documents/history/{type} - every version of one type. */
    public function history(Request $request, $candidateId, string $type)
    {
        $candidate = $this->find($request, $candidateId);

        if (! DocumentType::tryFrom($type)) {
            throw new ApiException(404, 'Unknown document type.');
        }

        return ApiResponse::ok(
            $candidate->documentHistory($type)->map->toPublic()->values()->all()
        );
    }

    /**
     * POST /candidates/{id}/documents
     * Adds another version. Any number may be attached to the same type.
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

        $versions = $candidate->documents()->where('type', $document->type)->count();

        return ApiResponse::created([
            'document' => $document->toPublic(),
            'versionCount' => $versions,
            'missing' => $candidate->fresh()->missingDocumentTypes(),
        ], $document->typeLabel().' uploaded (version '.$versions.').');
    }

    /**
     * POST /candidates/{id}/documents/bulk
     * Several files at once, keyed by document type.
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

    /** GET /candidates/{id}/documents/{documentId}/download - one exact version. */
    public function download(Request $request, $candidateId, $documentId)
    {
        $candidate = $this->find($request, $candidateId);
        $document = $this->findDocument($candidate, $documentId);

        return Storage::disk($document->disk)->download($document->path, $document->original_name);
    }

    /**
     * GET /candidates/{id}/documents/download-all
     *
     * One folder per document type, each holding the latest file uploaded for
     * it, so every type is visible separately. The archive is named after the
     * candidate.
     *
     * Built straight into the response by App\Support\ZipStream rather than
     * by ZipArchive: shared hosting often has neither ext-zip nor a reachable
     * sys_get_temp_dir(), and both failures used to surface only as a 500.
     */
    public function downloadAll(Request $request, $candidateId): StreamedResponse
    {
        $candidate = $this->find($request, $candidateId);
        $latest = $candidate->latestDocumentsByType();

        if ($latest === []) {
            throw new ApiException(404, 'This candidate has no documents yet.');
        }

        // Resolve everything before a single byte goes out: once the archive
        // has started streaming, a failure can no longer become a JSON error.
        $files = [];
        $position = 0;

        // Walk the canonical type order so the folders always read the same way.
        foreach (DocumentType::cases() as $type) {
            $document = $latest[$type->value] ?? null;
            if (! $document) {
                continue;   // nothing uploaded for this type
            }

            if (! Storage::disk($document->disk)->exists($document->path)) {
                continue;   // row survived but the file is gone
            }

            $position++;
            $files[] = [
                'disk' => $document->disk,
                'path' => $document->path,
                // "01 Passport Copy/passport.pdf"
                'name' => sprintf('%02d %s', $position, $type->label())
                    .'/'.$this->safeFileName($document->original_name),
            ];
        }

        if ($files === []) {
            throw new ApiException(404, 'None of the attached files could be found on disk.');
        }

        return response()->streamDownload(function () use ($files) {
            $zip = new ZipStream;

            foreach ($files as $file) {
                $zip->add($file['name'], Storage::disk($file['disk'])->get($file['path']));
                flush();
            }

            $zip->finish();
            flush();
        }, $this->archiveName($candidate->name), [
            'Content-Type' => 'application/zip',
            // Stops nginx/LiteSpeed from buffering the stream.
            'X-Accel-Buffering' => 'no',
        ]);
    }

    // ---------------------------------------------------------------------

    /** Always inserts a new row; earlier versions are left untouched. */
    private function save(Candidate $candidate, DocumentType $type, $file, $userId): CandidateDocument
    {
        $disk = config('documents.disk');
        $directory = 'candidates/'.$candidate->agency_id.'/'.$candidate->id.'/'.$type->value;
        $filename = Str::uuid().'.'.$file->getClientOriginalExtension();

        $path = $file->storeAs($directory, $filename, ['disk' => $disk]);

        return CandidateDocument::create([
            'candidate_id' => $candidate->id,
            'type' => $type->value,
            'disk' => $disk,
            'path' => $path,
            'original_name' => $file->getClientOriginalName(),
            'mime_type' => $file->getClientMimeType(),
            'size_bytes' => $file->getSize(),
            'uploaded_by' => $userId,
        ]);
    }

    /** "Kamal Perera" becomes "Kamal-Perera-documents.zip". */
    private function archiveName(string $candidateName): string
    {
        $slug = trim(preg_replace('/[^A-Za-z0-9]+/', '-', $candidateName), '-');

        return ($slug !== '' ? $slug : 'candidate').'-documents.zip';
    }

    /** Keeps a stored name from escaping its folder inside the archive. */
    private function safeFileName(string $name): string
    {
        $name = basename(str_replace('\\', '/', $name));

        return preg_replace('/[^A-Za-z0-9._ -]/', '_', $name) ?: 'document';
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
