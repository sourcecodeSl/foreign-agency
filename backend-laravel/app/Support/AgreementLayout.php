<?php

namespace App\Support;

/**
 * The fields of an agreement, section by section, as the paper prints them.
 *
 * Blanks in a PDF cannot be found by reading the file, so each agreement the
 * system knows is written out here once, from the document itself, with its
 * labels in all three languages it is printed in.
 *
 * Every field is filled in English - the binding version - and carried into
 * Hebrew and Sinhala by its kind:
 *
 *   text       copied exactly: names, numbers, codes. Translating a name or
 *              an ID number can only make it wrong.
 *   date       copied exactly, entered with a date picker.
 *   translate  descriptive words - an address, a position, a country - sent
 *              to the translation service, and marked for a person to check.
 */
final class AgreementLayout
{
    public const SEC_CONSTRUCTION_2025 = 'sec_construction_2025';

    /** Layouts an uploaded agreement can be read with, by key. */
    public static function names(): array
    {
        return [
            self::SEC_CONSTRUCTION_2025 => 'Employment Agreement - SEC Construction Sri Lanka 2025',
        ];
    }

    public static function exists(?string $key): bool
    {
        return array_key_exists((string) $key, self::names());
    }

    /** Every field key of a layout, for checking what is saved against it. */
    public static function keys(string $key): array
    {
        $keys = [];
        foreach (self::sections($key) as $section) {
            foreach ($section['fields'] as $field) {
                $keys[] = $field['key'];
            }
        }

        return $keys;
    }

    /**
     * The employer section on its own - the part a foreign company fills
     * from its own login, with every value read from its record.
     */
    public static function employerSection(): array
    {
        return self::sections(self::SEC_CONSTRUCTION_2025)[0];
    }

    /**
     * Which column of the agency record each employer field is read from.
     *
     * @return array<string, string>
     */
    public static function employerSources(): array
    {
        return [
            'company_name' => 'name',
            'company_registration_no' => 'registration_no',
            'company_address' => 'address',
            'representative_name' => 'lawyer_name',
            'representative_id_no' => 'lawyer_id_no',
            'representative_position' => 'lawyer_position',
        ];
    }

    /**
     * Where each field's blank sits on the uploaded paper, per language, so
     * the saved values can be written onto the original PDF.
     *
     * Each entry is [page, left, right, line] in PDF points from the bottom
     * left of an A4 page, read off the underscore lines of the SEC
     * Construction PDF; a fifth number is a second line to wrap onto. The
     * Hebrew column is written right to left, against its right edge. A
     * value the paper already prints is given as ['cover' => [lines...]]
     * instead: those lines are whited out and written over.
     *
     * @return array<string, array<string, array>>
     */
    public static function blanks(string $key): array
    {
        if ($key !== self::SEC_CONSTRUCTION_2025) {
            return [];
        }

        return [
            // Page 1: the employer.
            'company_name' => ['he' => [1, 42, 207, 693], 'en' => [1, 218, 377, 676], 'si' => [1, 395, 536, 702]],
            'company_registration_no' => ['he' => [1, 42, 207, 618], 'en' => [1, 218, 377, 627], 'si' => [1, 395, 536, 628]],
            'company_address' => ['he' => [1, 42, 207, 578, 554], 'en' => [1, 218, 383, 577, 553], 'si' => [1, 395, 536, 578, 554]],
            'representative_name' => ['he' => [1, 42, 207, 464], 'en' => [1, 218, 383, 456], 'si' => [1, 413, 530, 475]],
            'representative_id_no' => ['he' => [1, 45, 204, 415], 'en' => [1, 218, 377, 416], 'si' => [1, 395, 511, 436]],
            'representative_position' => ['he' => [1, 42, 207, 358], 'en' => [1, 218, 383, 357], 'si' => [1, 395, 549, 358, 344]],
            // Page 1: the employee.
            'employee_name' => ['he' => [1, 45, 204, 225], 'en' => [1, 218, 371, 233], 'si' => [1, 395, 516, 236]],
            'employee_id_no' => ['he' => [1, 45, 204, 176], 'en' => [1, 218, 377, 185], 'si' => [1, 395, 521, 186]],
            'passport_no' => ['he' => [1, 48, 207, 126], 'en' => [1, 218, 377, 135], 'si' => [1, 395, 521, 127]],
            'date_of_birth' => ['he' => [1, 45, 204, 76], 'en' => [1, 218, 377, 85], 'si' => [1, 395, 516, 87]],
            // Page 2: the employee's address.
            'employee_address' => ['he' => [2, 45, 204, 755], 'en' => [2, 218, 377, 754], 'si' => [2, 395, 527, 766]],
            // Page 8, clause 3a: the salary is printed, not left blank. `cover`
            // lists the stretches of line the printed figure and its words
            // take, each [page, left, right, line]: they are whited out and
            // the new salary is written across them in the same order.
            'salary' => [
                'he' => ['cover' => [[8, 42, 188, 518], [8, 42, 208, 501], [8, 76, 208, 484]]],
                'en' => ['cover' => [[8, 323, 384, 503], [8, 218, 384, 488], [8, 218, 384, 473], [8, 218, 303, 457]]],
                'si' => ['cover' => [[8, 395, 552, 529], [8, 395, 552, 514], [8, 395, 496, 500]]],
            ],
        ];
    }

    /**
     * Where the company seal and the signature go on every page: the foot of
     * the page, left of the page number, as [left, bottom, right, top] in
     * PDF points. A picture is fitted inside its box, never stretched.
     *
     * @return array<string, array<int, float>>
     */
    public static function marks(string $key): array
    {
        if ($key !== self::SEC_CONSTRUCTION_2025) {
            return [];
        }

        return [
            'seal' => [62, 6, 152, 60],
            'signature' => [166, 6, 280, 60],
        ];
    }

    /**
     * The heading the paper prints at the top of every page - "SEC
     * CONSTRUCTION- SRI LANKA -2025" - which the agreement's name takes the
     * place of. In PDF points from the bottom left: the stretch to white out
     * as [left, bottom, right, top], the baseline the name sits on, the
     * centre it is set around, its size in points, and the widest it may run
     * before it is set smaller. Measured from the document itself.
     *
     * @return array<string, mixed>|null
     */
    public static function heading(string $key): ?array
    {
        if ($key !== self::SEC_CONSTRUCTION_2025) {
            return null;
        }

        return [
            'cover' => [150, 786, 460, 810],
            'baseline' => 793.4,
            'centre' => 303.5,
            'size' => 14,
            'maxWidth' => 480,
        ];
    }

    /** The layout the screens render: sections, then fields with three labels. */
    public static function sections(string $key): array
    {
        if ($key !== self::SEC_CONSTRUCTION_2025) {
            return [];
        }

        $f = fn (string $key, string $kind, string $en, string $he, string $si, bool $multiline = false) => [
            'key' => $key,
            'kind' => $kind,
            'multiline' => $multiline,
            'label' => ['en' => $en, 'he' => $he, 'si' => $si],
        ];

        return [
            [
                'key' => 'employer',
                'title' => ['en' => 'Employer - manpower company', 'he' => 'המעסיק - תאגיד כוח-האדם', 'si' => 'සේවායෝජකයා - මෑන්පවර් සමාගම'],
                'fields' => [
                    $f('company_name', 'text', 'Manpower Company Name', 'שם תאגיד כוח-האדם', 'මෑන්පවර් සමාගම නම'),
                    $f('company_registration_no', 'text', 'Company Registration No.', 'ח.פ.', 'සමාගම් ලියාපදිංචි අංකය'),
                    $f('company_address', 'translate', 'Company Address', 'כתובת החברה', 'සමාගම් ලිපිනය', true),
                    $f('representative_name', 'text', 'Authorised representative - Name', 'נציג מורשה - שם', 'බලයලත් නියෝජිතයා - නම'),
                    $f('representative_id_no', 'text', 'Israeli I.D. No.', 'מספר ת.ז.', 'ඊශ්‍රායල හැඳුනුම්පත් අංකය'),
                    $f('representative_position', 'translate', 'Position in Company', 'תפקידו בחברה', 'සමාගමෙහි තනතුර'),
                ],
            ],
            [
                'key' => 'employee',
                'title' => ['en' => 'Employee', 'he' => 'העובד', 'si' => 'සේවකයා'],
                'fields' => [
                    $f('employee_name', 'text', "Employee's Name", 'שם העובד', 'සේවකයාගේ නම'),
                    $f('employee_id_no', 'text', 'ID No.', "מס' ת.ז.", 'හැඳුනුම්පත් අංකය'),
                    $f('passport_no', 'text', 'Passport Number', "מס' דרכון", 'ගමන් බලපත්‍ර අංකය'),
                    $f('date_of_birth', 'date', 'Date of Birth', 'תאריך לידה', 'උපන්දිනය'),
                    $f('employee_address', 'translate', 'Address', 'כתובת', 'ලිපිනය', true),
                ],
            ],
            [
                'key' => 'terms',
                'title' => ['en' => 'Terms of the agreement', 'he' => 'תנאי ההסכם', 'si' => 'ගිවිසුමේ කොන්දේසි'],
                'fields' => [
                    // Preamble: "...professional work in the construction sector in the ____ vocation."
                    $f('vocation', 'translate', 'Vocation (preamble)', 'מקצוע (מבוא)', 'වෘත්තිය (පූර්විකාව)'),
                    // The same blank recurs: travel from ____ (14d), the ____ Embassy (15b.5),
                    // contact person in ____ (16a), bank account in ____ (16b) and the ____
                    // State Employment Service in the witness statement.
                    $f('home_country', 'translate', "Employee's home country", 'ארץ המוצא של העובד', 'සේවකයාගේ මව් රට'),
                ],
            ],
            [
                'key' => 'emergency',
                'title' => ['en' => 'Emergency contact (16a)', 'he' => 'איש קשר במקרה חירום (16א)', 'si' => 'හදිසි අවස්ථාවක සම්බන්ධතා පුද්ගලයා (16a)'],
                'fields' => [
                    $f('emergency_name', 'text', 'Name', 'שם', 'නම'),
                    $f('emergency_id_no', 'text', 'ID Number', 'מספר ת.ז.', 'හැඳුනුම්පත් අංකය'),
                    $f('emergency_relationship', 'translate', 'Relationship', 'קרבה', 'සම්බන්ධතාවය'),
                    $f('emergency_phone', 'text', 'Telephone Number', 'מספר טלפון', 'දුරකථන අංකය'),
                    $f('emergency_address', 'translate', 'Address', 'כתובת', 'ලිපිනය', true),
                ],
            ],
            [
                'key' => 'bank',
                'title' => ['en' => 'Bank account (16b)', 'he' => 'חשבון בנק (16ב)', 'si' => 'බැංකු ගිණුම (16b)'],
                'fields' => [
                    $f('bank_name', 'text', 'Bank', 'בנק', 'බැංකුව'),
                    $f('bank_address', 'translate', 'Address', 'כתובת', 'ලිපිනය', true),
                    $f('account_number', 'text', 'Account Number', 'מספר חשבון בנק', 'ගිණුම් අංකය'),
                    $f('account_name', 'text', 'Name of Account', 'שם החשבון', 'ගිණුමේ නම'),
                    $f('bank_number', 'text', 'Bank Number', 'מספר הבנק', 'බැංකු අංකය'),
                    $f('swift_code', 'text', 'Swift Code', 'קוד סוויפט', 'ස්විෆ්ට් කේතය'),
                ],
            ],
            [
                'key' => 'employer_certification',
                'title' => ['en' => 'Employer signature certification', 'he' => 'הצהרת חתימה של המעסיק', 'si' => 'සේවායෝජකයාගේ අත්සන සහතික කිරීම'],
                'fields' => [
                    $f('certifier_name', 'text', 'Attorney / certified accountant name', 'שם עורך-הדין / רואה חשבון מוסמך', 'නීතිඥවරයාගේ / සහතික කළ ගණකාධිකාරීවරයාගේ නම'),
                    $f('certifier_license_no', 'text', 'License number', 'מספר רישיון', 'බලපත්‍ර අංකය'),
                    $f('signatory_name', 'text', 'Mr./Ms. (authorised to sign)', 'מר/גברת (המורשה לחתום)', 'මහතා/මහත්මිය (අත්සන් කිරීමට බලයලත්)'),
                    $f('signatory_id_no', 'text', 'Israel ID No.', 'ת.ז. ישראלית מספר', 'ඊශ්‍රායල් හැඳුනුම්පත් අංකය'),
                    $f('certified_employer_name', 'text', 'Employer Name', 'שם המעסיק', 'සේවායෝජකයාගේ නම'),
                    $f('certified_registry_no', 'text', 'Registry Number', 'מספר ח.פ.', 'ලියාපදිංචි අංකය'),
                    $f('certification_date', 'date', 'Date', 'תאריך', 'දිනය'),
                ],
            ],
            [
                'key' => 'employee_witness',
                'title' => ['en' => 'Witness to employee signature', 'he' => 'הצהרת חתימה של העובד', 'si' => 'සේවකයාගේ අත්සනට සාක්ෂිකරු'],
                'fields' => [
                    $f('witness_name', 'text', 'Name of the undersigned', 'שם החתום מטה', 'පහත අත්සන් කළ අයගේ නම'),
                    $f('witness_id_no', 'text', 'ID', 'מספר ת.ז.', 'හැඳුනුම්පත් අංකය'),
                ],
            ],
            [
                'key' => 'clerk',
                'title' => ['en' => 'Clerk', 'he' => 'הפקיד', 'si' => 'ලිපිකරු'],
                'fields' => [
                    $f('clerk_name', 'text', 'Clerk Name', 'שם הפקיד', 'ලිපිකරු නම'),
                    $f('clerk_id', 'text', 'Clerk ID', 'ת.ז. של הפקיד', 'ලිපිකරු හැඳුනුම්පත'),
                    $f('clerk_date', 'date', 'Date', 'תאריך', 'දිනය'),
                ],
            ],
        ];
    }
}
