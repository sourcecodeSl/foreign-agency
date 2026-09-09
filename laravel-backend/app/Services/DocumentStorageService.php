<?php

namespace App\Services;

use App\Enums\DocumentType;
use App\Models\Candidate;
use App\Models\CandidateDocument;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Stores candidate documents on the configured disk.
 *
 * Files go to a private location keyed by agency and candidate, never to a
 * publicly served directory, and are read back through an authorised
 * controller action.
 */
class DocumentStorageService
{
    /**
     * Saves an upload as the current file for that document type, replacing
     * whatever was there before.
     */
    public function store(Candidate $candidate, DocumentType $type, UploadedFile $file, ?int $userId): CandidateDocument
    {
        $disk = config('documents.disk');

        $directory = sprintf('candidates/%d/%d', $candidate->agency_id, $candidate->id);
        $filename = $type->value . '-' . Str::uuid() . '.' . $file->getClientOriginalExtension();

        $path = $file->storeAs($directory, $filename, ['disk' => $disk]);

        return DB::transaction(function () use ($candidate, $type, $file, $userId, $disk, $path) {
            $existing = $candidate->documents()->where('type', $type->value)->first();

            $document = CandidateDocument::updateOrCreate(
                ['candidate_id' => $candidate->id, 'type' => $type->value],
                [
                    'disk' => $disk,
                    'path' => $path,
                    'original_name' => $file->getClientOriginalName(),
                    'mime_type' => $file->getClientMimeType(),
                    'size_bytes' => $file->getSize(),
                    'uploaded_by' => $userId,
                ]
            );

            // Drop the superseded file only after the row points at the new one.
            if ($existing && $existing->path !== $path) {
                $existing->deleteFile();
            }

            return $document;
        });
    }

    public function delete(CandidateDocument $document): void
    {
        $document->deleteFile();
        $document->delete();
    }

    /** Which of the required documents are still missing. */
    public function missingTypes(Candidate $candidate): array
    {
        $present = $candidate->documents()->pluck('type')->map(
            fn ($t) => $t instanceof DocumentType ? $t->value : $t
        )->all();

        return array_values(array_diff(DocumentType::values(), $present));
    }
}
