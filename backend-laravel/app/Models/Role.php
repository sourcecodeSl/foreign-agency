<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Role extends Model
{
    protected $table = 'roles';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    protected $guarded = [];

    protected $casts = [
        'permissions' => 'array',
        'is_system' => 'boolean',
    ];

    public const MODULES = ['agencies', 'candidates', 'users', 'roles', 'reports', 'billing', 'settings'];

    public const ACTIONS = ['view', 'create', 'edit', 'delete'];

    public static function emptyMatrix(): array
    {
        $matrix = [];
        foreach (self::MODULES as $m) {
            $matrix[$m] = ['view' => false, 'create' => false, 'edit' => false, 'delete' => false];
        }

        return $matrix;
    }

    /** Normalises an incoming matrix so unknown keys can never widen access. */
    public static function cleanMatrix(?array $incoming): array
    {
        $clean = [];
        foreach (self::MODULES as $m) {
            foreach (self::ACTIONS as $a) {
                $clean[$m][$a] = (bool) ($incoming[$m][$a] ?? false);
            }
        }

        return $clean;
    }

    /** Shape the frontend renders for the user-types list. */
    public function toPublic(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'description' => $this->description,
            'system' => (bool) $this->is_system,
        ];
    }
}
