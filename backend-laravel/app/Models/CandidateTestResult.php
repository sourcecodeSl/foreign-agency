<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * How a candidate's test went in one job category, recorded by the foreign
 * company they are registered for (or the admin side). The local agency that
 * registered them reads every one, pass or fail.
 */
class CandidateTestResult extends Model
{
    protected $table = 'candidate_test_results';

    protected $guarded = [];

    public function candidate(): BelongsTo
    {
        return $this->belongsTo(Candidate::class);
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(JobRole::class, 'job_role_id');
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Agency::class, 'company_agency_id');
    }

    /** The assignment - and so the test numbers - it was recorded against. */
    public function registration(): BelongsTo
    {
        return $this->belongsTo(CandidateRegistration::class, 'registration_id');
    }

    public function recorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }

    public function toPublic(): array
    {
        return [
            'id' => $this->id,
            'registrationId' => $this->registration_id ? (int) $this->registration_id : null,
            'jobRoleId' => (int) $this->job_role_id,
            'jobRole' => $this->role?->name,
            'result' => $this->result,
            'note' => $this->note,
            'company' => $this->company_agency_id ? [
                'id' => $this->company_agency_id,
                'name' => $this->company?->name,
            ] : null,
            'recordedAt' => $this->updated_at,
        ];
    }
}
