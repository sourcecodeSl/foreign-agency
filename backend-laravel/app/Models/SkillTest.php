<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One skill test: a candidate tried for one job role, with one foreign
 * agency, on one day, under a test number of its own.
 *
 * Passing locks the candidate to that foreign company. Failing leaves them in
 * the pool, free to be tested again for another role or another agency - and
 * that next attempt is always a new test, never an edit of this one, so the
 * history of what was tried stays readable.
 */
class SkillTest extends Model
{
    /** The only status from which a result can still be recorded. */
    public const OPEN = 'scheduled';

    protected $table = 'skill_tests';

    protected $guarded = [];

    protected $casts = ['scheduled_for' => 'date'];

    /** TST-1001, TST-1002 ... one per attempt, never reused. */
    public static function nextTestNo(): string
    {
        return 'TST-'.AppCounter::next('test');
    }

    public function candidate(): BelongsTo
    {
        return $this->belongsTo(Candidate::class);
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(ForeignCompany::class, 'company_id');
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(JobRole::class, 'job_role_id');
    }

    public function toPublic(): array
    {
        return [
            'id' => $this->id,
            'testNo' => $this->test_no,
            'candidateId' => $this->candidate_id,
            'candidateName' => $this->candidate?->name,
            'agencyId' => $this->agency_id,
            'companyId' => $this->company_id,
            'companyName' => $this->company?->name,
            'jobRoleId' => $this->job_role_id,
            'jobRole' => $this->role?->name,
            'scheduledFor' => $this->scheduled_for?->toDateString(),
            'status' => $this->status,
            'resultNote' => $this->result_note,
            'decidedAt' => $this->decided_at,
            'createdAt' => $this->created_at,
        ];
    }
}
