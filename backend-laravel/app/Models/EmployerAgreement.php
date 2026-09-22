<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * The employer part of an employment agreement, as a foreign company
 * submitted it: company name, registration number, address, and the
 * representative who signs for it - each in English, Hebrew and Sinhala.
 */
class EmployerAgreement extends Model
{
    protected $table = 'employer_agreements';

    protected $guarded = [];

    protected $casts = ['field_values' => 'array'];

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class, 'agency_id');
    }

    public function submitter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function toPublic(): array
    {
        return [
            'id' => $this->id,
            'agencyId' => $this->agency_id,
            'agencyName' => $this->agency?->name,
            'values' => (object) ($this->field_values ?? []),
            'submittedBy' => $this->submitter?->name,
            'submittedAt' => $this->created_at,
        ];
    }
}
