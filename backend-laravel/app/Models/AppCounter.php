<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

class AppCounter extends Model
{
    protected $table = 'app_counters';

    protected $primaryKey = 'name';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    protected $guarded = [];

    /** Atomically increments a counter and returns the new value. */
    public static function next(string $name): int
    {
        return DB::transaction(function () use ($name) {
            $row = self::query()->lockForUpdate()->find($name);
            if (! $row) {
                $row = self::create(['name' => $name, 'value' => 0]);
            }
            $row->value = (int) $row->value + 1;
            $row->save();

            return (int) $row->value;
        });
    }
}
