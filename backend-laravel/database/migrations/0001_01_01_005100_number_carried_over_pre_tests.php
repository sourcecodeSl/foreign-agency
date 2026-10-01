<?php

use App\Models\CandidatePreTest;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Every pre-test carries the agency's index number for its job category -
 * the passes carried over from before pre-tests too. They had none, so they
 * take the next numbers now, oldest first.
 *
 * The pre-test is the agency's alone, so the note about a company that came
 * with those passes goes as well.
 */
return new class extends Migration
{
    public function up(): void
    {
        CandidatePreTest::numberUnnumbered();

        DB::table('candidate_pre_tests')
            ->where('note', 'Sent to a company before pre-tests began.')
            ->update(['note' => null]);
    }

    public function down(): void
    {
        // The numbers stay: they may already be written on test sheets.
    }
};
