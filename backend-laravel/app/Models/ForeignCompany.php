<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A foreign company: the overseas employer that runs skill tests and hires,
 * e.g. in Israel. Not to be confused with an agency of type foreign, which
 * registers its own candidates and signs in - both read as "foreign company"
 * on screen.
 *
 * Each one belongs to the coordinator (foreign agent) who brought it in: the
 * coordinator sees only their own, the Main Admin sees them all.
 */
class ForeignCompany extends Model
{
    protected $table = 'foreign_companies';

    protected $guarded = [];

    /** FC-1001, FC-1002 ... shown instead of the numeric id. */
    public static function nextCode(): string
    {
        return 'FC-'.AppCounter::next('company');
    }

    public function coordinator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'coordinator_id');
    }

    public function tests(): HasMany
    {
        return $this->hasMany(SkillTest::class, 'company_id');
    }

    /** Candidates who passed a test here, and so belong to this agency alone. */
    public function lockedCandidates(): HasMany
    {
        return $this->hasMany(Candidate::class, 'locked_company_id');
    }

    public function toPublic(array $extra = []): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'country' => $this->country,
            'city' => $this->city,
            'contact' => [
                'name' => $this->contact_name,
                'email' => $this->contact_email,
                'phone' => $this->contact_phone,
            ],
            'coordinatorId' => $this->coordinator_id,
            'coordinatorName' => $this->coordinator?->name,
            'status' => $this->status,
            'notes' => $this->notes,
            'createdAt' => $this->created_at,
        ] + $extra;
    }
}
