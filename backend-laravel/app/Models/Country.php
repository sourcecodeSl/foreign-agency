<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A country a foreign company may be registered in. */
class Country extends Model
{
    protected $table = 'countries';

    protected $guarded = [];

    protected $casts = ['active' => 'boolean'];

    public static function slugify(string $name): string
    {
        return trim(preg_replace('/[^a-z0-9]+/', '_', strtolower($name)), '_');
    }

    public function toPublic(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
        ];
    }
}
