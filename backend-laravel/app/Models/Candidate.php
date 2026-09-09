<?php

namespace App\Models;

use App\Support\DocumentType;
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

    /**
     * Which required documents are not usable.
     *
     * A row on its own is not enough: the current file has to be readable on
     * disk, otherwise the candidate would count as complete and become
     * submittable while the documents cannot actually be downloaded.
     */
    public function missingDocumentTypes(): array
    {
        $present = [];

        foreach ($this->latestDocumentsByType() as $type => $document) {
            if ($document->fileExists()) {
                $present[] = $type;
            }
        }

        return array_values(array_diff(DocumentType::values(), $present));
    }

    /**
     * The newest upload for each document type.
     *
     * Every upload is kept, so "the current file" is simply the highest id
     * within a type. Keyed by type value.
     *
     * @return array<string, CandidateDocument>
     */
    public function latestDocumentsByType(): array
    {
        $latest = [];

        foreach ($this->documents()->orderBy('id')->get() as $document) {
            $latest[$document->type] = $document;   // later rows overwrite earlier
        }

        return $latest;
    }

    /** History for one type, newest first. */
    public function documentHistory(string $type)
    {
        return $this->documents()->where('type', $type)->orderByDesc('id')->get();
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
            $latest = $this->latestDocumentsByType();

            // Full history, plus a flag marking the current file of each type.
            $payload['documents'] = $this->documents
                ->sortByDesc('id')
                ->map(fn ($d) => $d->toPublic() + [
                    'isLatest' => isset($latest[$d->type]) && $latest[$d->type]->id === $d->id,
                ])
                ->values()
                ->all();

            $payload['latestDocuments'] = array_map(
                fn ($d) => $d->toPublic(),
                $latest
            );
            $payload['missingDocuments'] = $this->missingDocumentTypes();
        }

        return $payload;
    }
}
