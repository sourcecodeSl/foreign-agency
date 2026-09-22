<?php

namespace App\Support;

/**
 * English written out in Hebrew and Sinhala letters, by sound.
 *
 * For names above all: a name is never translated - "Low" is a surname, not
 * the word for low - it is spelt in the other script. Words that are not
 * names (an address, a position) are translated through TranslationService
 * when a key is set; without one they come here too, after a short list of
 * the words these papers use most, which are put in their real translation.
 *
 * It spells by rule, not by knowing the name, so the screen marks every value
 * from here for a person to check.
 */
final class Transliterator
{
    /** Common words and places, as they are actually written - not spelt by sound. */
    private const WORDS = [
        'general manager' => ['he' => 'מנהל כללי', 'si' => 'සාමාන්‍යාධිකාරී'],
        'managing director' => ['he' => 'מנהל', 'si' => 'කළමනාකාර අධ්‍යක්ෂ'],
        'secretary' => ['he' => 'מזכיר', 'si' => 'ලේකම්'],
        'company secretary' => ['he' => 'מזכיר החברה', 'si' => 'සමාගම් ලේකම්'],
        'director' => ['he' => 'דירקטור', 'si' => 'අධ්‍යක්ෂ'],
        'manager' => ['he' => 'מנהל', 'si' => 'කළමනාකරු'],
        'ceo' => ['he' => 'מנכ"ל', 'si' => 'ප්‍රධාන විධායක නිලධාරී'],
        'chairman' => ['he' => 'יושב ראש', 'si' => 'සභාපති'],
        'owner' => ['he' => 'בעלים', 'si' => 'හිමිකරු'],
        'partner' => ['he' => 'שותף', 'si' => 'හවුල්කරු'],
        'lawyer' => ['he' => 'עורך דין', 'si' => 'නීතිඥ'],
        'attorney' => ['he' => 'עורך דין', 'si' => 'නීතිඥ'],
        'advocate' => ['he' => 'עורך דין', 'si' => 'නීතිඥ'],
        'accountant' => ['he' => 'רואה חשבון', 'si' => 'ගණකාධිකාරී'],
        'street' => ['he' => 'רחוב', 'si' => 'වීදිය'],
        'road' => ['he' => 'דרך', 'si' => 'පාර'],
        'israel' => ['he' => 'ישראל', 'si' => 'ඊශ්‍රායලය'],
        'india' => ['he' => 'הודו', 'si' => 'ඉන්දියාව'],
        'sri lanka' => ['he' => 'סרי לנקה', 'si' => 'ශ්‍රී ලංකාව'],
        'dubai' => ['he' => 'דובאי', 'si' => 'ඩුබායි'],
        'tel aviv' => ['he' => 'תל אביב', 'si' => 'ටෙල් අවිව්'],
        'jerusalem' => ['he' => 'ירושלים', 'si' => 'ජෙරුසලම'],
        'haifa' => ['he' => 'חיפה', 'si' => 'හයිෆා'],
        'colombo' => ['he' => 'קולומבו', 'si' => 'කොළඹ'],
        'ltd' => ['he' => 'בע"מ', 'si' => 'සමාගම'],
    ];

    /**
     * A name, spelt in the target script. Digits and punctuation stay as
     * they are.
     */
    public static function name(string $text, string $lang): string
    {
        return preg_replace_callback('/[a-z]+/i', fn ($m) => self::word($m[0], $lang), $text);
    }

    /** Words: the known ones translated, the rest spelt out by sound. */
    public static function words(string $text, string $lang): string
    {
        $phrases = array_keys(self::WORDS);
        usort($phrases, fn ($a, $b) => strlen($b) - strlen($a));
        $pattern = '/\b('.implode('|', array_map(fn ($p) => preg_quote($p, '/'), $phrases)).')\b/i';

        $parts = preg_split($pattern, $text, -1, PREG_SPLIT_DELIM_CAPTURE);
        $out = '';
        foreach ($parts as $i => $part) {
            // Odd pieces are the captured phrases.
            $out .= $i % 2 === 1 ? self::WORDS[strtolower($part)][$lang] : self::name($part, $lang);
        }

        return $out;
    }

    private static function word(string $word, string $lang): string
    {
        $word = strtolower($word);

        return $lang === 'he' ? self::hebrew($word) : self::sinhala($word);
    }

    // --- Hebrew -----------------------------------------------------------

    private const HE_CONSONANTS = [
        'sh' => 'ש', 'ch' => "צ'", 'th' => 'ת', 'ph' => 'פ', 'kh' => 'ח', 'ts' => 'צ', 'tz' => 'צ',
        'ck' => 'ק', 'gh' => 'ג', 'zh' => "ז'",
        'b' => 'ב', 'd' => 'ד', 'f' => 'פ', 'g' => 'ג', 'h' => 'ה', 'j' => "ג'", 'k' => 'ק', 'l' => 'ל',
        'm' => 'מ', 'n' => 'נ', 'p' => 'פ', 'q' => 'ק', 'r' => 'ר', 's' => 'ס', 't' => 'ט', 'v' => 'ו',
        'w' => 'ו', 'x' => 'קס', 'z' => 'ז',
    ];

    private const HE_VOWELS = [
        'ee' => 'י', 'ea' => 'י', 'ie' => 'י', 'oo' => 'ו', 'ou' => 'ו', 'ow' => 'ו', 'oa' => 'ו',
        'ai' => 'אי', 'ay' => 'יי', 'ei' => 'יי', 'ey' => 'יי', 'au' => 'או',
        'a' => '', 'e' => '', 'i' => 'י', 'o' => 'ו', 'u' => 'ו', 'y' => 'י',
    ];

    private const HE_FINALS = ['כ' => 'ך', 'מ' => 'ם', 'נ' => 'ן', 'פ' => 'ף', 'צ' => 'ץ'];

    private static function hebrew(string $w): string
    {
        $out = '';
        $len = strlen($w);
        $i = 0;

        while ($i < $len) {
            $rest = substr($w, $i);

            // A doubled consonant is heard once.
            if ($i > 0 && $w[$i] === $w[$i - 1] && ! self::isVowel($w[$i])) {
                $i++;
                continue;
            }

            // y before a vowel is a consonant.
            if ($w[$i] === 'y' && $i + 1 < $len && self::isVowel($w[$i + 1])) {
                $out .= 'י';
                $i++;
                continue;
            }

            if ($w[$i] === 'c' && ! in_array($w[$i + 1] ?? '', ['h', 'k'], true)) {
                $out .= in_array($w[$i + 1] ?? '', ['e', 'i', 'y'], true) ? 'ס' : 'ק';
                $i++;
                continue;
            }

            if ($match = self::longest($rest, self::HE_CONSONANTS)) {
                $out .= self::HE_CONSONANTS[$match];
                $i += strlen($match);
                continue;
            }

            if ($match = self::longest($rest, self::HE_VOWELS)) {
                $letter = self::HE_VOWELS[$match];
                if ($i === 0) {
                    // A word never opens on a vowel letter alone.
                    $letter = 'א'.($letter === 'אי' ? 'י' : $letter);
                } elseif ($match === 'a' && $i + 1 === $len) {
                    $letter = 'ה';
                }
                $out .= $letter;
                $i += strlen($match);
                continue;
            }

            $i++;
        }

        $end = mb_substr($out, -1);
        if (isset(self::HE_FINALS[$end])) {
            $out = mb_substr($out, 0, -1).self::HE_FINALS[$end];
        }

        return $out;
    }

    // --- Sinhala ----------------------------------------------------------

    private const SI_CONSONANTS = [
        'sh' => 'ශ', 'ch' => 'ච', 'th' => 'ත', 'dh' => 'ද', 'ph' => 'ෆ', 'kh' => 'ක', 'gh' => 'ග', 'ck' => 'ක',
        'b' => 'බ', 'd' => 'ඩ', 'f' => 'ෆ', 'g' => 'ග', 'h' => 'හ', 'j' => 'ජ', 'k' => 'ක', 'l' => 'ල',
        'm' => 'ම', 'n' => 'න', 'p' => 'ප', 'q' => 'ක', 'r' => 'ර', 's' => 'ස', 't' => 'ට', 'v' => 'ව',
        'w' => 'ව', 'z' => 'ස',
    ];

    /** Each vowel: [the letter on its own, the sign after a consonant]. */
    private const SI_VOWELS = [
        'aa' => ['ආ', 'ා'], 'ee' => ['ඊ', 'ී'], 'ea' => ['ඊ', 'ී'], 'ie' => ['ඊ', 'ී'], 'oo' => ['ඌ', 'ූ'],
        'ow' => ['ඕ', 'ෝ'], 'oa' => ['ඕ', 'ෝ'], 'au' => ['ඕ', 'ෝ'], 'ou' => ['අව්', 'ව්'],
        'ai' => ['අයි', 'ායි'], 'ay' => ['එයි', 'ෙයි'], 'ei' => ['එයි', 'ෙයි'], 'ey' => ['එයි', 'ෙයි'],
        'a' => ['අ', ''], 'e' => ['එ', 'ෙ'], 'i' => ['ඉ', 'ි'], 'o' => ['ඔ', 'ො'], 'u' => ['උ', 'ු'],
        'y' => ['ඉ', 'ි'],
    ];

    private const HAL = '්';

    private const ZWJ = "\u{200D}";

    private static function sinhala(string $w): string
    {
        $out = '';
        $pending = null; // a consonant still waiting to hear its vowel
        $len = strlen($w);
        $i = 0;

        $flush = function (?string $next = null) use (&$out, &$pending) {
            if ($pending !== null) {
                // ක් + ර is written ක්‍ර, and ක් + ය is ක්‍ය.
                $out .= $pending.self::HAL.(in_array($next, ['ර', 'ය'], true) ? self::ZWJ : '');
                $pending = null;
            }
        };

        while ($i < $len) {
            $rest = substr($w, $i);
            $c = $w[$i];

            if ($i > 0 && $c === $w[$i - 1] && ! self::isVowel($c)) {
                $i++;
                continue;
            }

            // y before a vowel is a consonant.
            if ($c === 'y' && $i + 1 < $len && self::isVowel($w[$i + 1])) {
                $flush('ය');
                $pending = 'ය';
                $i++;
                continue;
            }

            if ($c === 'x') {
                $flush('ක');
                $out .= 'ක'.self::HAL;
                $pending = 'ස';
                $i++;
                continue;
            }

            if ($c === 'c' && ! in_array($w[$i + 1] ?? '', ['h', 'k'], true)) {
                $letter = in_array($w[$i + 1] ?? '', ['e', 'i', 'y'], true) ? 'ස' : 'ක';
                $flush($letter);
                $pending = $letter;
                $i++;
                continue;
            }

            if ($consonant = self::longest($rest, self::SI_CONSONANTS)) {
                $letter = self::SI_CONSONANTS[$consonant];
                $flush($letter);
                $pending = $letter;
                $i += strlen($consonant);
                continue;
            }

            if ($match = self::longest($rest, self::SI_VOWELS)) {
                $atEnd = $i + strlen($match) === $len;
                [$alone, $sign] = self::SI_VOWELS[$match];

                if ($match === 'e' && $atEnd && $pending !== null && $len > 3) {
                    // A silent e at the end: "Rose" is heard without it.
                    $i++;
                    continue;
                }

                if ($match === 'a' && $atEnd) {
                    $sign = 'ා';
                }

                if ($pending !== null) {
                    $out .= $pending.$sign;
                    $pending = null;
                } elseif ($i > 0) {
                    // Two vowels meet: a y glides between them.
                    $out .= 'ය'.$sign;
                } else {
                    $out .= $alone;
                }

                $i += strlen($match);
                continue;
            }

            $i++;
        }

        $flush();

        return $out;
    }

    // ----------------------------------------------------------------------

    private static function isVowel(string $c): bool
    {
        return str_contains('aeiou', $c);
    }

    /** The longest key of the map that the text starts with. */
    private static function longest(string $text, array $map): ?string
    {
        foreach ([2, 1] as $size) {
            $head = substr($text, 0, $size);
            if (strlen($head) === $size && isset($map[$head])) {
                return $head;
            }
        }

        return null;
    }
}
