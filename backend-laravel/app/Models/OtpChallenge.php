<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OtpChallenge extends Model
{
    protected $table = 'otp_challenges';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    protected $guarded = [];

    protected $casts = [
        'meta' => 'array',
        'expires_at' => 'integer',
        'last_sent_at' => 'integer',
        'attempts' => 'integer',
    ];
}
