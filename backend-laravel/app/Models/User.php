<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Users table access, ported from models/user.model.js.
 *
 * Rows are mapped to the shape the frontend already renders (id, name, email,
 * phone, role, agency, status, lastLogin) via toPublic().
 */
class User extends Model
{
    protected $table = 'users';

    public $timestamps = true;

    protected $guarded = [];

    protected $hidden = ['password_hash'];

    private const ROLE_LABELS = [
        'main_admin' => 'Main Admin',
        'agency_owner' => 'Agency Owner',
        'agency_manager' => 'Agency Manager',
        'agent' => 'Agent',
        'auditor' => 'Auditor',
    ];

    public static function roleLabel(?string $slug): string
    {
        if ($slug && isset(self::ROLE_LABELS[$slug])) {
            return self::ROLE_LABELS[$slug];
        }
        return ucwords(str_replace('_', ' ', (string) $slug));
    }

    /** Public shape - the password hash never leaves this method. */
    public function toPublic(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'phone' => $this->phone,
            'roleSlug' => $this->role_slug,
            'role' => self::roleLabel($this->role_slug),
            'agency' => $this->agency_name ?: null,
            'agencyId' => $this->agency_id,
            'status' => $this->status,
            'emailVerifiedAt' => $this->email_verified_at,
            'phoneVerifiedAt' => $this->phone_verified_at,
            'lastLogin' => $this->last_login_at,
            'createdAt' => $this->created_at,
        ];
    }

    /** Accepts an email or a phone number, so people can sign in with either. */
    public static function findByLoginWithHash(?string $identifier): ?self
    {
        $value = trim((string) $identifier);
        $digits = preg_replace('/\D/', '', $value);

        return self::query()
            ->whereRaw('email = ? OR REPLACE(REPLACE(phone, " ", ""), "+", "") = ?', [
                strtolower($value),
                $digits,
            ])
            ->first();
    }

    public static function emailExists(string $email): bool
    {
        return self::where('email', strtolower(trim($email)))->exists();
    }

    public static function phoneExists(string $phone): bool
    {
        $digits = preg_replace('/\D/', '', $phone);

        return self::whereRaw('REPLACE(REPLACE(phone, " ", ""), "+", "") = ?', [$digits])->exists();
    }

    public static function verifyPassword(string $plain, ?string $hash): bool
    {
        return $hash ? password_verify($plain, $hash) : false;
    }
}
