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

    /** Client-safe view: the password hash is dropped via $hidden on toArray(). */
    public function toPublic(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'code' => $this->code,
            'address' => $this->address,
            'username' => $this->username,
            'contact' => $this->contact,
            'email' => $this->email,
            'users' => (int) $this->users,
            'status' => $this->status,
            'createdAt' => $this->created_at,
        ];
    }
}
