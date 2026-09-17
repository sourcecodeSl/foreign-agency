<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Agency extends Model
{
    protected $table = 'agencies';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    protected $guarded = [];

    protected $hidden = ['password_hash'];

    protected $casts = [
        'users' => 'integer',
    ];

    /** A local agency recruits in Sri Lanka; a foreign one is based overseas. */
    public const TYPES = ['local', 'foreign'];

    /**
     * Client-safe view: the password hash is dropped via $hidden on toArray().
     *
     * `users` is counted from the logins that actually exist. The stored
     * column is set once when the agency is created and never kept up to
     * date, so it is not read. A listing passes its counts in rather than
     * running a query per row.
     */
    public function toPublic(?int $users = null): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'code' => $this->code,
            'type' => $this->type ?? 'local',
            'address' => $this->address,
            // Agencies from before foreign agencies existed are all Sri Lankan.
            'country' => $this->country ?? (($this->type ?? 'local') === 'local' ? 'Sri Lanka' : null),
            'username' => $this->username,
            'contact' => $this->contact,
            'email' => $this->email,
            'users' => $users ?? User::where('agency_id', $this->id)->count(),
            'status' => $this->status,
            'createdAt' => $this->created_at,
        ];
    }
}
