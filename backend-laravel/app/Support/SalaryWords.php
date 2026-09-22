<?php

namespace App\Support;

/**
 * A monthly salary in New Israeli Shekels, written the way the agreement
 * prints it in each of its languages: the figure, then the amount in words.
 *
 *   en  NIS 6,247.67 (Six thousand two hundred forty-seven New Israeli Shekels and sixty-seven agorot)
 *   he  6,247.67 ₪ (ששת אלפים מאתיים ארבעים ושבעה שקלים חדשים ושישים ושבע אגורות)
 *   si  NIS 6,247.67 (නව ඊශ්‍රායල ෂෙකෙල් හයදහස් දෙසිය හතළිස් හතක් සහ ඇගොරොට් හැට හතක්)
 *
 * Shekels are counted in the masculine in Hebrew and agorot in the feminine,
 * as the paper does. Amounts up to 999,999.99.
 */
final class SalaryWords
{
    /** @return array{en: string, he: string, si: string} */
    public static function phrases(float $amount): array
    {
        $cents = (int) round($amount * 100);
        $shekels = intdiv($cents, 100);
        $agorot = $cents % 100;
        $figure = number_format($cents / 100, 2);

        return [
            'en' => 'NIS '.$figure.' ('.self::english($shekels, $agorot).')',
            'he' => $figure.' ₪ ('.self::hebrew($shekels, $agorot).')',
            'si' => 'NIS '.$figure.' ('.self::sinhala($shekels, $agorot).')',
        ];
    }

    // --- English ------------------------------------------------------------

    private const EN_ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
        'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];

    private const EN_TENS = [2 => 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

    private static function englishUnder1000(int $n): string
    {
        $parts = [];
        if ($n >= 100) {
            $parts[] = self::EN_ONES[intdiv($n, 100)].' hundred';
            $n %= 100;
        }
        if ($n >= 20) {
            $parts[] = self::EN_TENS[intdiv($n, 10)].($n % 10 ? '-'.self::EN_ONES[$n % 10] : '');
        } elseif ($n > 0) {
            $parts[] = self::EN_ONES[$n];
        }

        return implode(' ', $parts);
    }

    private static function englishNumber(int $n): string
    {
        if ($n === 0) {
            return 'zero';
        }
        $parts = [];
        if ($n >= 1000) {
            $parts[] = self::englishUnder1000(intdiv($n, 1000)).' thousand';
        }
        if ($n % 1000) {
            $parts[] = self::englishUnder1000($n % 1000);
        }

        return implode(' ', $parts);
    }

    private static function english(int $shekels, int $agorot): string
    {
        $text = self::englishNumber($shekels).' New Israeli '.($shekels === 1 ? 'Shekel' : 'Shekels');
        if ($agorot) {
            $text .= ' and '.self::englishNumber($agorot).' '.($agorot === 1 ? 'agora' : 'agorot');
        }

        return ucfirst($text);
    }

    // --- Hebrew -------------------------------------------------------------

    private const HE_MASC = ['', 'אחד', 'שניים', 'שלושה', 'ארבעה', 'חמישה', 'שישה', 'שבעה', 'שמונה', 'תשעה'];

    private const HE_MASC_TEENS = ['עשרה', 'אחד עשר', 'שנים עשר', 'שלושה עשר', 'ארבעה עשר', 'חמישה עשר',
        'שישה עשר', 'שבעה עשר', 'שמונה עשר', 'תשעה עשר'];

    private const HE_FEM = ['', 'אחת', 'שתיים', 'שלוש', 'ארבע', 'חמש', 'שש', 'שבע', 'שמונה', 'תשע'];

    private const HE_FEM_TEENS = ['עשר', 'אחת עשרה', 'שתים עשרה', 'שלוש עשרה', 'ארבע עשרה', 'חמש עשרה',
        'שש עשרה', 'שבע עשרה', 'שמונה עשרה', 'תשע עשרה'];

    private const HE_TENS = [2 => 'עשרים', 'שלושים', 'ארבעים', 'חמישים', 'שישים', 'שבעים', 'שמונים', 'תשעים'];

    private const HE_HUNDREDS = ['', 'מאה', 'מאתיים', 'שלוש מאות', 'ארבע מאות', 'חמש מאות', 'שש מאות',
        'שבע מאות', 'שמונה מאות', 'תשע מאות'];

    /** 3 000 to 10 000 take the construct form: ששת אלפים. */
    private const HE_THOUSANDS = [1 => 'אלף', 'אלפיים', 'שלושת אלפים', 'ארבעת אלפים', 'חמשת אלפים', 'ששת אלפים',
        'שבעת אלפים', 'שמונת אלפים', 'תשעת אלפים', 'עשרת אלפים'];

    /** The words of n below 1000, as parts, the last to take "and". */
    private static function hebrewParts(int $n, bool $feminine): array
    {
        $parts = [];
        if ($n >= 100) {
            $parts[] = self::HE_HUNDREDS[intdiv($n, 100)];
            $n %= 100;
        }
        if ($n >= 20) {
            $parts[] = self::HE_TENS[intdiv($n, 10)];
            $n %= 10;
        }
        if ($n >= 10) {
            $parts[] = ($feminine ? self::HE_FEM_TEENS : self::HE_MASC_TEENS)[$n - 10];
        } elseif ($n > 0) {
            $parts[] = ($feminine ? self::HE_FEM : self::HE_MASC)[$n];
        }

        return $parts;
    }

    private static function hebrewNumber(int $n, bool $feminine): string
    {
        if ($n === 0) {
            return 'אפס';
        }

        $parts = [];
        $thousands = intdiv($n, 1000);
        if ($thousands) {
            $parts[] = $thousands <= 10
                ? self::HE_THOUSANDS[$thousands]
                : implode(' ', self::joinWithAnd(self::hebrewParts($thousands, false))).' אלף';
        }
        $parts = array_merge($parts, self::hebrewParts($n % 1000, $feminine));

        return implode(' ', self::joinWithAnd($parts));
    }

    /** "And" goes on the last part: מאתיים ארבעים ושבעה. */
    private static function joinWithAnd(array $parts): array
    {
        if (count($parts) > 1) {
            $parts[count($parts) - 1] = 'ו'.$parts[count($parts) - 1];
        }

        return $parts;
    }

    private static function hebrew(int $shekels, int $agorot): string
    {
        $text = $shekels === 1 ? 'שקל חדש אחד' : self::hebrewNumber($shekels, false).' שקלים חדשים';
        if ($agorot) {
            $text .= ' ו'.($agorot === 1 ? 'אגורה אחת' : self::hebrewNumber($agorot, true).' אגורות');
        }

        return $text;
    }

    // --- Sinhala ------------------------------------------------------------

    /** A unit counted on its own, at the end: හතක් (seven). */
    private const SI_UNIT = ['', 'එකක්', 'දෙකක්', 'තුනක්', 'හතරක්', 'පහක්', 'හයක්', 'හතක්', 'අටක්', 'නවයක්'];

    /** A unit before what it multiplies: හය + දහස් (six thousand). */
    private const SI_UNIT_PREFIX = ['', 'එක්', 'දෙ', 'තුන්', 'හාර', 'පන්', 'හය', 'හත්', 'අට', 'නව'];

    private const SI_TEEN = ['දහයක්', 'එකොළහක්', 'දොළහක්', 'දහතුනක්', 'දහහතරක්', 'පහළොවක්', 'දහසයක්',
        'දහහතක්', 'දහඅටක්', 'දහනවයක්'];

    private const SI_TEEN_PREFIX = ['දස', 'එකොළොස්', 'දොළොස්', 'දහතුන්', 'දහහතර', 'පසළොස්', 'දහසය', 'දහහත්',
        'දහඅට', 'දහනව'];

    /** Tens before a unit: හතළිස් හතක් (forty-seven). */
    private const SI_TENS_PREFIX = [2 => 'විසි', 'තිස්', 'හතළිස්', 'පනස්', 'හැට', 'හැත්තෑ', 'අසූ', 'අනූ'];

    /** Tens at the end: හතළිහක් (forty). */
    private const SI_TENS = [2 => 'විස්සක්', 'තිහක්', 'හතළිහක්', 'පනහක්', 'හැටක්', 'හැත්තෑවක්', 'අසූවක්', 'අනූවක්'];

    private static function sinhalaUnder100(int $n, bool $prefix): string
    {
        if ($n < 10) {
            return ($prefix ? self::SI_UNIT_PREFIX : self::SI_UNIT)[$n];
        }
        if ($n < 20) {
            return ($prefix ? self::SI_TEEN_PREFIX : self::SI_TEEN)[$n - 10];
        }
        $tens = intdiv($n, 10);
        $unit = $n % 10;
        if (! $unit) {
            return $prefix ? self::SI_TENS_PREFIX[$tens] : self::SI_TENS[$tens];
        }

        return self::SI_TENS_PREFIX[$tens].' '.($prefix ? self::SI_UNIT_PREFIX : self::SI_UNIT)[$unit];
    }

    /** Below 1000; `prefix` for a count that multiplies a thousand. */
    private static function sinhalaUnder1000(int $n, bool $prefix): string
    {
        $hundreds = intdiv($n, 100);
        $rest = $n % 100;
        $parts = [];

        if ($hundreds) {
            $head = $hundreds === 1 ? 'එක' : self::SI_UNIT_PREFIX[$hundreds];
            // සිය before more, සීයක් when nothing follows.
            $parts[] = $rest || $prefix ? $head.'සිය' : ($hundreds === 1 ? 'සියයක්' : $head.'සීයක්');
        }
        if ($rest) {
            $parts[] = self::sinhalaUnder100($rest, $prefix);
        }

        return implode(' ', $parts);
    }

    private static function sinhalaNumber(int $n): string
    {
        if ($n === 0) {
            return 'බිංදුවක්';
        }

        $thousands = intdiv($n, 1000);
        $rest = $n % 1000;
        $parts = [];

        if ($thousands) {
            $parts[] = self::sinhalaUnder1000($thousands, true).($rest ? 'දහස්' : 'දහසක්');
        }
        if ($rest) {
            $parts[] = self::sinhalaUnder1000($rest, false);
        }

        return implode(' ', $parts);
    }

    private static function sinhala(int $shekels, int $agorot): string
    {
        $text = 'නව ඊශ්‍රායල ෂෙකෙල් '.self::sinhalaNumber($shekels);
        if ($agorot) {
            $text .= ' සහ ඇගොරොට් '.self::sinhalaNumber($agorot);
        }

        return $text;
    }
}
