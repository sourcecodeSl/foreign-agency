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
            'uploadedBy' => $this->uploaded_by,
            'uploadedAt' => $this->created_at,
        ];
    }
}
