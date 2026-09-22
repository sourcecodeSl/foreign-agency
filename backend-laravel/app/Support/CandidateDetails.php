<?php

namespace App\Support;

use App\Models\Candidate;

/**
 * The employee part of the agreement, filled from a candidate's file when a
 * local agency assigns the candidate to it: name, ID number, passport
 * number, date of birth and address.
 *
 * Carried into Hebrew and Sinhala the same way as the employer part (see
 * EmployerDetails): the name spelt in each script, the numbers and the date
 * copied as they are, the address translated.
 */
final class CandidateDetails
{
    /** How each employee field is carried into Hebrew and Sinhala. */
    public const KINDS = [
        'employee_name' => 'name',
        'employee_id_no' => 'text',
        'passport_no' => 'text',
        // Printed as the paper prints it, the same in every language.
        'date_of_birth' => 'text',
        'employee_address' => 'translate',
    ];

    /** The employee section, each field carrying the kind it is filled by. */
    public static function section(): array
    {
        $section = AgreementLayout::sections(AgreementLayout::SEC_CONSTRUCTION_2025)[1];
        foreach ($section['fields'] as &$field) {
            $field['kind'] = self::KINDS[$field['key']] ?? 'text';
        }

        return $section;
    }

    /** Each employee field's English, straight from the candidate's file. */
    public static function english(Candidate $candidate): array
    {
        return [
            'employee_name' => trim((string) $candidate->name),
            'employee_id_no' => trim((string) $candidate->nic_no),
            'passport_no' => trim((string) $candidate->passport_no),
            'date_of_birth' => $candidate->date_of_birth?->format('d/m/Y') ?? '',
            'employee_address' => trim((string) $candidate->address),
        ];
    }

    /** A person's name is only ever spelt; the address may hold words with a real translation. */
    public static function spelt(string $key, string $en, string $lang): string
    {
        return $key === 'employee_name' ? Transliterator::name($en, $lang) : Transliterator::words($en, $lang);
    }

    /** @return array{0: array, 1: ?string} the values, and why translation failed if it did */
    public static function fill(Candidate $candidate): array
    {
        return EmployerDetails::localise(self::section(), self::english($candidate), [self::class, 'spelt']);
    }

    /** The local agency's corrections to the Hebrew and Sinhala, made safe. */
    public static function fromRequest(Candidate $candidate, array $sent): array
    {
        return EmployerDetails::clean(self::section(), self::english($candidate), $sent, [self::class, 'spelt']);
    }
}
