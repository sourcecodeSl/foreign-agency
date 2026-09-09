<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A candidate is registered by an agency and never signs in, so there is no
 * password and no OTP here. Every record is owned by exactly one agency.
 */
class Candidate extends Model
{
    use SoftDeletes;

    protected $table = 'candidates';

    protected $guarded = [];

    public function documents(): HasMany
    {
        return $this->hasMany(CandidateDocument::class);
    }

    /**
     * Restricts a query to one agency. Agency staff are always scoped through
     * this; passing null (Main Admin, auditor) returns every agency.
     */
    public function scopeForAgency(Builder $query, ?string $agencyId): Builder
    {
        return $agencyId === null ? $query : $query->where('agency_id', $agencyId);
    }

    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        $term = trim((string) $term);
        if ($term === '') {
            return $query;
        }

        $like = '%'.$term.'%';

        return $query->where(function (Builder $q) use ($like) {
            $q->where('name', 'like', $like)
                ->orWhere('passport_no', 'like', $like)
                ->orWhere('nic_no', 'like', $like)
                ->orWhere('mobile', 'like', $like)
                ->orWhere('email', 'like', $like);
        });
    }

    /** Which required documents are still outstanding. */
    public function missingDocumentTypes(): array
    {
        $present = $this->documents()->pluck('type')->all();

        return array_values(array_diff(\App\Support\DocumentType::values(), $present));
    }

    /** camelCase shape, matching the rest of the API. */
    public function toPublic(bool $withDocuments = false): array
    {
        $payload = [
            'id' => $this->id,
            'agencyId' => $this->agency_id,
            'name' => $this->name,
            'passportNo' => $this->passport_no,
            'nicNo' => $this->nic_no,
            'address' => $this->address,
            'mobile' => $this->mobile,
            'email' => $this->email,
            'status' => $this->status,
            'notes' => $this->notes,
            'createdAt' => $this->created_at,
            'updatedAt' => $this->updated_at,
        ];

        if ($withDocuments) {
            $payload['documents'] = $this->documents->map->toPublic()->all();
            $payload['missingDocuments'] = $this->missingDocumentTypes();
        }

        return $payload;
    }
}
