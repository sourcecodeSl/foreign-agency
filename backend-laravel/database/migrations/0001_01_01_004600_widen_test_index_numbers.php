<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Test index numbers carry five digits: TL00001 rather than TL001.
 *
 * The numbers already handed out keep their value and only gain the zeros,
 * so each stays the one number its candidate holds, and the counters behind
 * them carry on from where they were - no number is ever given twice.
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->repad(5);
    }

    public function down(): void
    {
        $this->repad(3);
    }

    private function repad(int $digits): void
    {
        DB::table('candidate_registration_roles')
            ->whereNotNull('test_index_no')
            ->orderBy('id')
            ->each(function ($row) use ($digits) {
                if (! preg_match('/^([A-Z]+)(\d+)$/', $row->test_index_no, $m)) {
                    return;
                }

                $number = $m[1].str_pad((string) (int) $m[2], $digits, '0', STR_PAD_LEFT);
                if ($number !== $row->test_index_no) {
                    DB::table('candidate_registration_roles')->where('id', $row->id)->update(['test_index_no' => $number]);
                }
            });
    }
};
