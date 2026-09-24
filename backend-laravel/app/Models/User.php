<?php

namespace App\Models;

use App\Support\PageAccess;
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

    protected $casts = [
        // Pages the Main Admin has opened to a coordinator; unused by other roles.
        'page_access' => 'array',
        // Light or dark, accent, sidebar and text size (AppearanceController).
        'appearance' => 'array',
    ];

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
            'username' => $this->username,
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

    /** Accepts a username, an email or a phone number as the identifier. */
    public static function findByLoginWithHash(?string $identifier): ?self
    {
        $value = trim((string) $identifier);
        $digits = preg_replace('/\D/', '', $value);

        // Single quotes inside the raw SQL: SQLite reads double quotes as
        // identifiers, so "+" there would not be a string literal.
        return self::query()
            ->where(function ($q) use ($value, $digits) {
                $q->where('username', $value)
                    ->orWhere('email', strtolower($value));

                if ($digits !== '') {
                    $q->orWhereRaw("REPLACE(REPLACE(phone, ' ', ''), '+', '') = ?", [$digits]);
                }
            })
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

    /**
     * Why this account may not sign in right now, or null when it may.
     *
     * An agency login also needs its agency approved. The owner login is
     * created active, but the agency itself starts pending, and until the
     * administrator approves it - or once it is deactivated - nobody signs in
     * under it.
     */
    public function signInRefusal(): ?string
    {
        if ($this->status === 'pending') {
            return 'This account is awaiting approval.';
        }
        if ($this->status !== 'active') {
            return 'This account has been deactivated. Contact system support.';
        }

        if ($this->agency_id) {
            $agency = Agency::where('id', $this->agency_id)->value('status');

            if ($agency === 'pending') {
                return 'Your agency is awaiting approval by the administrator. You can sign in once it has been approved.';
            }
            if ($agency !== 'active') {
                return 'Your agency has been deactivated. Contact system support.';
            }
        }

        return null;
    }

    /**
     * The contact details this login still has to confirm with a code when it
     * signs in - 'phone' first, then 'email'.
     *
     * The Main Admin is never asked. Every other login confirms each one once,
     * on its first sign-in, and is not asked for it again; only a change to
     * that detail (see assignEmail and assignPhone) clears it.
     */
    public function unconfirmedContacts(): array
    {
        if ($this->role_slug === 'main_admin') {
            return [];
        }

        return array_keys(array_filter([
            'phone' => ! $this->phone_verified_at,
            'email' => ! $this->email_verified_at,
        ]));
    }

    /** The pages opened to this login - only ever a coordinator's. */
    public function pageAccess(): array
    {
        if ($this->role_slug !== PageAccess::ROLE) {
            return [];
        }

        return PageAccess::clean((array) $this->page_access);
    }

    /** Sets the email, clearing its confirmation when the address really changes. */
    public function assignEmail(string $email): void
    {
        $email = strtolower(trim($email));

        if ($email !== $this->email) {
            $this->email = $email;
            $this->email_verified_at = null;
        }
    }

    /** Sets the phone, clearing its confirmation when the number really changes. */
    public function assignPhone(string $phone): void
    {
        if (preg_replace('/\D/', '', $phone) !== preg_replace('/\D/', '', (string) $this->phone)) {
            $this->phone_verified_at = null;
        }

        $this->phone = $phone;
    }

    public static function verifyPassword(string $plain, ?string $hash): bool
    {
        return $hash ? password_verify($plain, $hash) : false;
    }
}
