<?php

namespace App\Models;

use App\Support\AgreementLayout;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** An uploaded agreement PDF, and the layout its blanks are read with. */
class AgreementTemplate extends Model
{
    protected $table = 'agreement_templates';

    protected $guarded = [];

    /** The foreign company that uploaded it; none when the admin side did. */
    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class, 'agency_id');
    }

    public function agreements(): HasMany
    {
        return $this->hasMany(Agreement::class, 'template_id');
    }

    public function toPublic(bool $withLayout = false): array
    {
        $payload = [
            'id' => $this->id,
            'name' => $this->name,
            'layout' => $this->layout,
            'layoutName' => AgreementLayout::names()[$this->layout] ?? $this->layout,
            'agencyId' => $this->agency_id,
            'agencyName' => $this->agency?->name,
            'originalName' => $this->original_name,
            'sizeBytes' => (int) $this->size_bytes,
            'saved' => (bool) $this->saved,
            // Uploaded by the admin side for every foreign company to use.
            'fromAdmin' => $this->agency_id === null,
            // Where the name is written over the printed heading on every page.
            'heading' => AgreementLayout::heading((string) $this->layout),
            'agreements' => $this->agreements_count ?? null,
            'uploadedAt' => $this->created_at,
        ];

        if ($withLayout) {
            $payload['sections'] = AgreementLayout::sections($this->layout);
        }

        return $payload;
    }
}
