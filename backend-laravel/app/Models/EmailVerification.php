<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EmailVerification extends Model
{
    protected $table = 'email_verifications';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    protected $guarded = [];

    protected $hidden = ['token'];

    protected $casts = [
        'attempts' => 'integer',
    ];

    public function toPublic(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'agency' => $this->agency,
            'status' => $this->status,
            'requestedAt' => $this->requested_at,
            'attempts' => (int) $this->attempts,
            'verifiedAt' => $this->verified_at,
        ];
    }
}
