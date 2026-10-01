<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One attempt at the local agency's pre-test in one job category. A pass on
 * the latest attempt is what lets the candidate go to a company's final test
 * in that category.
 */
class CandidatePreTest extends Model
{
    protected $table = 'candidate_pre_tests';

    protected $guarded = [];

    protected $casts = [
        'candidate_id' => 'integer',
        'job_role_id' => 'integer',
        'recorded_at' => 'datetime',
    ];

    public const PENDING = 'pending';

    public const PASS = 'pass';

    public const FAIL = 'fail';

    public function candidate(): BelongsTo
    {
        return $this->belongsTo(Candidate::class);
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(JobRole::class, 'job_role_id');
    }

    public function booker(): BelongsTo
    {
        return $this->belongsTo(User::class, 'booked_by');
    }

    public function recorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }

    /**
     * Gives every pre-test still without an index number - the passes
     * carried over from before pre-tests - the next number in its job
     * category, oldest first, as if each had been issued then.
     */
    public static function numberUnnumbered(): void
    {
        $roles = [];

        foreach (self::whereNull('index_no')->orderBy('id')->get() as $test) {
            $role = $roles[$test->job_role_id] ??= JobRole::find($test->job_role_id);
            if ($role) {
                $test->update(['index_no' => $role->nextPreTestIndex()]);
            }
        }
    }

    public function toPublic(): array
    {
        return [
            'id' => $this->id,
            'jobRoleId' => $this->job_role_id,
            'jobRole' => $this->role?->name,
            'indexNo' => $this->index_no,
            'result' => $this->result,
            'note' => $this->note,
            'bookedAt' => $this->created_at?->toIso8601String(),
            'bookedBy' => $this->booker?->name,
            'recordedAt' => $this->recorded_at?->toIso8601String(),
            'recordedBy' => $this->recorder?->name,
        ];
    }
}
