<?php

namespace App\Models;

use App\Support\DocumentType;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

class CandidateDocument extends Model
{
    protected $table = 'candidate_documents';

    protected $guarded = [];

    // The stored path is an internal detail; downloads go through the API.
    protected $hidden = ['path', 'disk'];

    public function candidate(): BelongsTo
    {
        return $this->belongsTo(Candidate::class);
    }

    public function typeLabel(): string
    {
        return DocumentType::tryFrom($this->type)?->label() ?? $this->type;
    }

    /** Removes the stored file. Called before the row is deleted or replaced. */
    public function deleteFile(): void
    {
        Storage::disk($this->disk)->delete($this->path);
    }

    /**
     * Whether the file this row points at is actually on disk.
     *
     * A row can outlive its file: an upload that failed to write before the
     * disk was checked left an empty path behind, and a deploy that skips
     * storage/ leaves the paths pointing at nothing. Either way the row must
     * not keep claiming the document is attached.
     */
    public function fileExists(): bool
    {
        return is_string($this->path)
            && $this->path !== ''
            && Storage::disk($this->disk)->exists($this->path);
    }

    public function toPublic(): array
    {
        return [
            'id' => $this->id,
            'candidateId' => $this->candidate_id,
            'type' => $this->type,
            'typeLabel' => $this->typeLabel(),
            'originalName' => $this->original_name,
            'mimeType' => $this->mime_type,
            'sizeBytes' => (int) $this->size_bytes,
            // False means the row is there but the file behind it is not, so
            // the UI can ask for it again instead of offering a dead download.
            'available' => $this->fileExists(),
            'uploadedBy' => $this->uploaded_by,
            'uploadedAt' => $this->created_at,
        ];
    }
}
