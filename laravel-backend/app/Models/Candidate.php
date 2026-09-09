<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A candidate never logs in, so there is no password and no OTP here.
 * Every record is owned by exactly one agency.
 */
class Candidate extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'agency_id',
        'name',
        'passport_no',
        'nic_no',
        'address',
        'mobile',
        'email',
        'status',
        'notes',
        'created_by',
    ];

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function documents(): HasMany
    {
        return $this->hasMany(CandidateDocument::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Restricts a query to one agency. Agency users are always scoped through
     * this; a Main Admin may pass null to see everything.
     */
    public function scopeForAgency(Builder $query, ?int $agencyId): Builder
    {
        return $agencyId === null ? $query : $query->where('agency_id', $agencyId);
    }

    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        $term = trim((string) $term);
        if ($term === '') {
            return $query;
        }

        return $query->where(function (Builder $q) use ($term) {
            $like = '%' . $term . '%';
            $q->where('name', 'like', $like)
                ->orWhere('passport_no', 'like', $like)
                ->orWhere('nic_no', 'like', $like)
                ->orWhere('mobile', 'like', $like)
                ->orWhere('email', 'like', $like);
        });
    }
}
