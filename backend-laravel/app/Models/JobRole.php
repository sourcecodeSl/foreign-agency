<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A trade a candidate is tested for, such as Tiler or Shuttering Carpenter. */
class JobRole extends Model
{
    protected $table = 'job_roles';

    protected $guarded = [];

    protected $casts = ['active' => 'boolean'];

    /** The codes the first trades were given; any other trade gets one made up. */
    private const CODES = [
        'tiler' => 'TL',
        'shuttering_carpenter' => 'SC',
        'mason' => 'MS',
        'steel_fixer' => 'SF',
        'welder' => 'WL',
        'electrician' => 'EL',
        'plumber' => 'PL',
        'painter' => 'PT',
        'heavy_vehicle_driver' => 'HV',
        'caregiver' => 'CG',
        'agriculture_worker' => 'AW',
        'general_labourer' => 'GL',
    ];

    public static function slugify(string $name): string
    {
        return trim(preg_replace('/[^a-z0-9]+/', '_', strtolower($name)), '_');
    }

    /**
     * A two-letter code no other trade has: the known one, else the initials
     * of a two-word name, else the first letter and one that follows it.
     */
    public static function makeCode(string $name): string
    {
        $taken = self::query()->whereNotNull('code')->pluck('code')->all();
        $free = fn (string $code) => ! in_array($code, $taken, true);

        $known = self::CODES[self::slugify($name)] ?? null;
        if ($known && $free($known)) {
            return $known;
        }

        $letters = preg_replace('/[^A-Z]/', '', strtoupper($name));
        $words = preg_split('/[^A-Z]+/', strtoupper($name), -1, PREG_SPLIT_NO_EMPTY);
        $first = $letters[0] ?? 'X';

        $tries = [];
        if (count($words) >= 2) {
            $tries[] = $words[0][0].$words[1][0];
        }
        // Consonants read closer to the name (PL, not PU), then any letter.
        foreach ([preg_replace('/[AEIOU]/', '', substr($letters, 1)), substr($letters, 1)] as $rest) {
            foreach (str_split($rest ?: '') as $letter) {
                $tries[] = $first.$letter;
            }
        }
        foreach (range('A', 'Z') as $a) {
            foreach (range('A', 'Z') as $b) {
                $tries[] = $a.$b;
            }
        }

        foreach ($tries as $code) {
            if ($free($code)) {
                return $code;
            }
        }

        return substr($first, 0, 1).count($taken);
    }

    public static function counterName(int $roleId): string
    {
        return 'test_index_'.$roleId;
    }

    /** How many digits follow the trade's two letters. */
    public const INDEX_DIGITS = 5;

    /** TL00001, TL00002 ... TL99999, then TL100000. */
    public static function formatIndex(string $code, int $number): string
    {
        return $code.str_pad((string) $number, self::INDEX_DIGITS, '0', STR_PAD_LEFT);
    }

    /** The next unused test index number in this trade. */
    public function nextTestIndex(): string
    {
        if (! $this->code) {
            $this->update(['code' => self::makeCode($this->name)]);
        }

        return self::formatIndex($this->code, AppCounter::next(self::counterName($this->id)));
    }

    public function toPublic(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'code' => $this->code,
            'active' => (bool) $this->active,
        ];
    }
}
