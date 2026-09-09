<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A verification step in flight. The code itself is stored hashed; only the
 * recipient ever sees the plain value.
 */
class OtpChallenge extends Model
{
    use HasUuids;

    protected $fillable = [
        'user_id',
        'channel',
        'destination',
        'code_hash',
        'attempts',
        'phone_verified',
        'last_sent_at',
        'expires_at',
        'consumed_at',
    ];

    protected $hidden = ['code_hash'];

    protected function casts(): array
    {
        return [
            'last_sent_at' => 'datetime',
            'expires_at' => 'datetime',
            'consumed_at' => 'datetime',
            'phone_verified' => 'boolean',
            'attempts' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isExpired(): bool
    {
        return $this->expires_at->isPast();
    }

    public function isConsumed(): bool
    {
        return $this->consumed_at !== null;
    }

    /** Seconds still to wait before another code may be requested. */
    public function cooldownRemaining(): int
    {
        $elapsed = $this->last_sent_at->diffInSeconds(now());

        return (int) max(0, config('otp.resend_cooldown') - $elapsed);
    }
}
