<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * A candidate put up with one foreign company, for the job categories that
 * company tests them in. A candidate may hold several until they pass; the
 * pass leaves only the company that gave it valid.
 */
class CandidateRegistration extends Model
{
    protected $table = 'candidate_registrations';

    protected $guarded = [];

    public function candidate(): BelongsTo
    {
        return $this->belongsTo(Candidate::class);
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Agency::class, 'company_agency_id');
    }

    public function jobRoles(): BelongsToMany
    {
        return $this->belongsToMany(JobRole::class, 'candidate_registration_roles', 'registration_id', 'job_role_id')
            ->withTimestamps()
            ->orderBy('candidate_registration_roles.id');
    }

    /**
     * open - waiting for results; passed - the pass is with this company;
     * void - the candidate passed with another company, so this one lapsed.
     */
    public function state(): string
    {
        $candidate = $this->candidate;

        if (! $candidate->isPassed()) {
            return 'open';
        }

        return $candidate->company_agency_id === $this->company_agency_id ? 'passed' : 'void';
    }

    public function toPublic(): array
    {
        $candidate = $this->candidate;

        return [
            'id' => $this->id,
            'company' => [
                'id' => $this->company_agency_id,
                'name' => $this->company?->name,
            ],
            'jobRoles' => $this->jobRoles->map(fn (JobRole $role) => [
                'id' => $role->id,
                'name' => $role->name,
            ])->values()->all(),
            'state' => $this->state(),
            // What this company recorded, one row per trade.
            'results' => $candidate->categoryResults
                ->where('company_agency_id', $this->company_agency_id)
                ->map(fn (CandidateTestResult $result) => $result->toPublic())
                ->values()->all(),
            'createdAt' => $this->created_at,
        ];
    }
}
