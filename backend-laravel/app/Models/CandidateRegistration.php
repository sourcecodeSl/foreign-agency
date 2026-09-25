<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\DB;

/**
 * A candidate assigned to one foreign company's test, for the job categories
 * that company tests them in - one entry in the candidate's history.
 *
 * A coordinator or the Main Admin makes the assignment. Moving the candidate
 * to another company, or sending them for a new test after a fail, ends this
 * one (ended_at, with the reason) and starts another; an ended assignment
 * keeps its test numbers and results for the report.
 */
class CandidateRegistration extends Model
{
    protected $table = 'candidate_registrations';

    protected $guarded = [];

    protected $casts = ['decided_at' => 'datetime', 'ended_at' => 'datetime'];

    public const PENDING = 'pending';

    public const APPROVED = 'approved';

    public const REJECTED = 'rejected';

    /** Why an assignment ended. */
    public const END_REASONS = [
        'moved' => 'Moved to another company',
        'new_test' => 'Sent for a new test',
    ];

    /** Only an approved registration reaches the company and carries test numbers. */
    public function isApproved(): bool
    {
        return ($this->approval ?? self::APPROVED) === self::APPROVED;
    }

    public function scopeApproved(Builder $query): Builder
    {
        return $query->where('approval', self::APPROVED);
    }

    /** Still the candidate's assignment, not one in the history. */
    public function isCurrent(): bool
    {
        return $this->ended_at === null;
    }

    public function scopeCurrent(Builder $query): Builder
    {
        return $query->whereNull('ended_at');
    }

    /**
     * Let through to the company: its categories get their test index
     * numbers and the company has the candidate on its list from now on.
     */
    public function approve(?int $by): void
    {
        $this->update([
            'approval' => self::APPROVED,
            'decided_at' => now(),
            'decided_by' => $by,
            'decision_note' => null,
        ]);
        $this->assignTestIndexes();
    }

    /** Sent back to the local agency, with the reason. */
    public function reject(?int $by, string $note): void
    {
        $this->update([
            'approval' => self::REJECTED,
            'decided_at' => now(),
            'decided_by' => $by,
            'decision_note' => $note,
        ]);
    }

    /** Changed after a rejection: it waits for a decision again. */
    public function resubmit(): void
    {
        if ($this->approval === self::REJECTED) {
            $this->update(['approval' => self::PENDING, 'decided_at' => null, 'decided_by' => null]);
        }
    }

    /** Closed for good, kept in the history: moved on, or a new test started. */
    public function end(?int $by, string $reason): void
    {
        $this->update(['ended_at' => now(), 'ended_by' => $by, 'end_reason' => $reason]);
    }

    public function decider(): BelongsTo
    {
        return $this->belongsTo(User::class, 'decided_by');
    }

    public function ender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'ended_by');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function candidate(): BelongsTo
    {
        return $this->belongsTo(Candidate::class);
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Agency::class, 'company_agency_id');
    }

    /** What was recorded under this assignment, one row per job category. */
    public function results(): HasMany
    {
        return $this->hasMany(CandidateTestResult::class, 'registration_id')->orderBy('id');
    }

    public function jobRoles(): BelongsToMany
    {
        return $this->belongsToMany(JobRole::class, 'candidate_registration_roles', 'registration_id', 'job_role_id')
            ->withPivot('test_index_no')
            ->withTimestamps()
            ->orderBy('candidate_registration_roles.id');
    }

    /**
     * Gives each trade on this registration that has no test index number
     * yet the next one in its trade. A number is never handed out twice, and
     * a trade taken off and put back gets a fresh one.
     */
    public function assignTestIndexes(): void
    {
        // Numbers are given out on approval, never before.
        if (! $this->isApproved()) {
            return;
        }

        $waiting = DB::table('candidate_registration_roles')
            ->where('registration_id', $this->id)
            ->whereNull('test_index_no')
            ->orderBy('id')
            ->get(['id', 'job_role_id']);

        foreach ($waiting as $row) {
            DB::table('candidate_registration_roles')->where('id', $row->id)->update([
                'test_index_no' => JobRole::findOrFail($row->job_role_id)->nextTestIndex(),
            ]);
        }

        $this->unsetRelation('jobRoles');
    }

    /** This assignment's results, from the candidate's when they are loaded. */
    public function recordedResults()
    {
        $candidate = $this->candidate;

        return $candidate && $candidate->relationLoaded('categoryResults')
            ? $candidate->categoryResults->where('registration_id', $this->id)->values()
            : $this->results()->get();
    }

    /**
     * ended - in the history, the candidate moved on from it; open - waiting
     * for results; passed - it holds the candidate's pass; void - the
     * candidate passed under another assignment, so this one lapsed.
     */
    public function state(): string
    {
        if (! $this->isCurrent()) {
            return 'ended';
        }

        $candidate = $this->candidate;

        if (! $candidate->isPassed()) {
            return 'open';
        }

        return $this->recordedResults()->contains('result', 'pass') ? 'passed' : 'void';
    }

    public function toPublic(): array
    {
        return [
            'id' => $this->id,
            'company' => [
                'id' => $this->company_agency_id,
                'name' => $this->company?->name,
            ],
            'jobRoles' => $this->jobRoles->map(fn (JobRole $role) => [
                'id' => $role->id,
                'name' => $role->name,
                // The number the company's test sheet carries for this trade.
                'testIndexNo' => $role->pivot?->test_index_no,
            ])->values()->all(),
            'state' => $this->state(),
            'current' => $this->isCurrent(),
            // pending until a coordinator or the Main Admin approves it; only
            // then does the company see the candidate.
            'approval' => $this->approval ?? self::APPROVED,
            'decision' => $this->decided_at ? [
                'at' => $this->decided_at,
                'by' => $this->decider?->name,
                'note' => $this->decision_note,
            ] : null,
            // Moved on from, and why - kept for the history.
            'ended' => $this->ended_at ? [
                'at' => $this->ended_at,
                'by' => $this->ender?->name,
                'reason' => $this->end_reason,
                'label' => self::END_REASONS[$this->end_reason] ?? 'Ended',
            ] : null,
            // What was recorded under this assignment, one row per trade.
            'results' => $this->recordedResults()
                ->map(fn (CandidateTestResult $result) => $result->toPublic())
                ->values()->all(),
            'createdAt' => $this->created_at,
        ];
    }
}
