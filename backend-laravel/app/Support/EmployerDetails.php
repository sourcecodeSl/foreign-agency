<?php

namespace App\Support;

use App\Exceptions\ApiException;
use App\Models\Agency;
use App\Services\TranslationService;

/**
 * The employer part of the agreement, filled from a foreign company's record:
 * company name, registration number and address, and the lawyer's name, ID
 * number and position.
 *
 * Each is carried into Hebrew and Sinhala by what it is:
 *
 *   text       numbers, copied exactly.
 *   name       spelt in the other script by sound (Transliterator) - a name
 *              is never translated.
 *   translate  the address and the position, through the translation
 *              service when a key is set, spelt by sound otherwise.
 */
final class EmployerDetails
{
    /** How each employer field is carried into Hebrew and Sinhala. */
    public const KINDS = [
        'company_name' => 'name',
        'company_registration_no' => 'text',
        'company_address' => 'translate',
        'representative_name' => 'name',
        'representative_id_no' => 'text',
        'representative_position' => 'translate',
    ];

    /** The employer section, each field carrying the kind it is filled by. */
    public static function section(): array
    {
        $section = AgreementLayout::employerSection();
        foreach ($section['fields'] as &$field) {
            $field['kind'] = self::KINDS[$field['key']] ?? 'text';
        }

        return $section;
    }

    /** Each employer field's English, straight from the company record. */
    public static function english(Agency $agency): array
    {
        $english = [];
        foreach (AgreementLayout::employerSources() as $key => $column) {
            $english[$key] = trim((string) $agency->{$column});
        }

        return $english;
    }

    /** The fields the record leaves empty, by their English label. */
    public static function missing(array $english): array
    {
        $missing = [];
        foreach (self::section()['fields'] as $field) {
            if ($english[$field['key']] === '') {
                $missing[] = $field['label']['en'];
            }
        }

        return $missing;
    }

    /**
     * A name or a word in the other script, by sound. A person's name is
     * only ever spelt; the company name and the words may hold terms such as
     * Ltd or Street that have a real translation.
     */
    public static function spelt(string $key, string $en, string $lang): string
    {
        return $key === 'representative_name'
            ? Transliterator::name($en, $lang)
            : Transliterator::words($en, $lang);
    }

    /**
     * What a company sent back after checking the employer part, made safe:
     * the English is always the record's and numbers are copied as they are;
     * only the Hebrew and Sinhala of names and words are taken from it. One
     * left empty is filled again rather than left in English.
     */
    public static function fromRequest(Agency $agency, array $sent): array
    {
        return self::clean(self::section(), self::english($agency), $sent, [self::class, 'spelt']);
    }

    /**
     * A company's own edit of the employer part on its agreement: every
     * language of every field is its to change, English and numbers too.
     * A cell left empty is filled again from the record rather than left
     * blank. Only this agreement changes; the company record stays as it is.
     */
    public static function edited(Agency $agency, array $sent): array
    {
        $record = self::english($agency);
        $values = [];

        foreach (self::section()['fields'] as $field) {
            $key = $field['key'];
            $en = trim((string) ($sent[$key]['en'] ?? '')) ?: $record[$key];
            if ($en === '') {
                continue;
            }

            $value = ['en' => $en, 'auto' => ['he' => false, 'si' => false]];
            foreach (['he', 'si'] as $lang) {
                $text = trim((string) ($sent[$key][$lang] ?? ''));
                if ($text !== '') {
                    $value[$lang] = $text;
                    $value['auto'][$lang] = (bool) ($sent[$key]['auto'][$lang] ?? false);
                } else {
                    $value[$lang] = $field['kind'] === 'text' ? $en : self::spelt($key, $en, $lang);
                    $value['auto'][$lang] = $field['kind'] !== 'text';
                }
            }

            $values[$key] = $value;
        }

        return $values;
    }

    /**
     * Every employer field in all three languages, as agreement values.
     *
     * @return array{0: array, 1: ?string} the values, and why translation failed if it did
     */
    public static function fill(Agency $agency): array
    {
        return self::localise(self::section(), self::english($agency), [self::class, 'spelt']);
    }

    // --- shared with CandidateDetails ---------------------------------------

    /**
     * Sent values made safe against a section: English from the record,
     * numbers copied, and only the Hebrew and Sinhala of names and words
     * kept from what was sent. Fields the record leaves empty are left out.
     *
     * @param  callable(string $key, string $en, string $lang): string  $spelt
     */
    public static function clean(array $section, array $english, array $sent, callable $spelt): array
    {
        $clean = [];

        foreach ($section['fields'] as $field) {
            $key = $field['key'];
            $en = $english[$key] ?? '';
            if ($en === '') {
                continue;
            }

            $value = ['en' => $en, 'he' => $en, 'si' => $en, 'auto' => ['he' => false, 'si' => false]];

            if ($field['kind'] !== 'text') {
                foreach (['he', 'si'] as $lang) {
                    $text = trim((string) ($sent[$key][$lang] ?? ''));
                    $value[$lang] = $text !== '' ? $text : $spelt($key, $en, $lang);
                    $value['auto'][$lang] = $text !== '' ? (bool) ($sent[$key]['auto'][$lang] ?? false) : true;
                }
            }

            $clean[$key] = $value;
        }

        return $clean;
    }

    /**
     * Every field of a section in all three languages, from its English:
     * numbers copied, names spelt, words translated where a key is set.
     *
     * @param  callable(string $key, string $en, string $lang): string  $spelt
     * @return array{0: array, 1: ?string} the values, and why translation failed if it did
     */
    public static function localise(array $section, array $english, callable $spelt): array
    {
        $values = [];
        $toTranslate = [];
        foreach ($section['fields'] as $field) {
            $en = $english[$field['key']] ?? '';
            $value = ['en' => $en, 'he' => $en, 'si' => $en, 'auto' => ['he' => false, 'si' => false]];

            if ($en !== '' && $field['kind'] !== 'text') {
                foreach (['he', 'si'] as $lang) {
                    $value[$lang] = $spelt($field['key'], $en, $lang);
                    $value['auto'][$lang] = true;
                }
                if ($field['kind'] === 'translate') {
                    $toTranslate[] = $field['key'];
                }
            }

            $values[$field['key']] = $value;
        }

        // A real translation, where a key is set, over the spelling by sound.
        $error = null;
        if ($toTranslate && TranslationService::configured()) {
            try {
                $translated = TranslationService::fromEnglish(array_map(fn ($key) => $english[$key], $toTranslate));

                foreach ($toTranslate as $i => $key) {
                    foreach (['he', 'si'] as $lang) {
                        if (($translated[$lang][$i] ?? '') !== '') {
                            $values[$key][$lang] = $translated[$lang][$i];
                        }
                    }
                }
            } catch (ApiException $e) {
                // The spelling by sound stays in place, to correct by hand.
                $error = $e->getMessage();
            }
        }

        return [$values, $error];
    }
}
