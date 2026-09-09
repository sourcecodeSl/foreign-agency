<?php

namespace App\Models;

use App\Enums\AccountStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Agency extends Model
{
    use HasFactory;

    protected $fillable = [
        'code',
        'name',
        'address',
        'contact_person',
        'email',
        'phone',
        'status',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'status' => AccountStatus::class,
        ];
    }

    /** Login accounts belonging to this agency. */
    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function candidates(): HasMany
    {
        return $this->hasMany(Candidate::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function isActive(): bool
    {
        return $this->status === AccountStatus::Active;
    }

    /** Builds the next unused agency code, e.g. SKY-1042. */
    public static function generateCode(string $name): string
    {
        $prefix = strtoupper(substr(preg_replace('/[^A-Za-z]/', '', $name) ?: 'AGN', 0, 3));
        $prefix = str_pad($prefix, 3, 'X');

        do {
            $code = $prefix . '-' . random_int(1000, 9999);
        } while (static::where('code', $code)->exists());

        return $code;
    }
}
