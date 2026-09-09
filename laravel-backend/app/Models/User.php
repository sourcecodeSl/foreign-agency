<?php

namespace App\Models;

use App\Enums\AccountStatus;
use App\Enums\UserRole;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

/**
 * Login account for both roles.
 *
 * A Main Admin has role = main_admin and no agency; an agency login has
 * role = agency and belongs to exactly one agency.
 */
class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = [
        'name',
        'username',
        'email',
        'phone',
        'password',
        'role',
        'agency_id',
        'status',
        'phone_verified_at',
        'last_login_at',
        'must_change_password',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'phone_verified_at' => 'datetime',
            'last_login_at' => 'datetime',
            'password' => 'hashed',
            'role' => UserRole::class,
            'status' => AccountStatus::class,
            'must_change_password' => 'boolean',
        ];
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function otpChallenges(): HasMany
    {
        return $this->hasMany(OtpChallenge::class);
    }

    public function isMainAdmin(): bool
    {
        return $this->role === UserRole::MainAdmin;
    }

    public function isAgency(): bool
    {
        return $this->role === UserRole::Agency;
    }

    public function isActive(): bool
    {
        return $this->status === AccountStatus::Active;
    }

    /** Does this role have to clear phone + email OTP at login? */
    public function requiresOtp(): bool
    {
        return in_array($this->role->value, config('otp.required_roles', []), true);
    }
}
