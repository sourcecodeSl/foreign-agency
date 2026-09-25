<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One line of a candidate's test document, written by the foreign company
 * testing them. Added only - never edited or removed - and kept for as long
 * as the candidate file is.
 */
class CandidateTestLine extends Model
{
    protected $table = 'candidate_test_lines';

    protected $guarded = [];

    protected $casts = [
        'candidate_id' => 'integer',
        'recorded_by' => 'integer',
    ];

    public function candidate(): BelongsTo
    {
        return $this->belongsTo(Candidate::class);
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Agency::class, 'company_agency_id');
    }

    public function recorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }

    public function toPublic(): array
    {
        return [
            'id' => $this->id,
            'body' => $this->body,
            'company' => $this->company_agency_id ? [
                'id' => $this->company_agency_id,
                'name' => $this->company?->name,
            ] : null,
            'recordedBy' => $this->recorder?->name,
            'at' => $this->created_at?->toIso8601String(),
        ];
    }
}
