<?php

namespace App\Services;

use App\Exceptions\ApiException;
use Illuminate\Support\Facades\Http;

/**
 * English into Hebrew and Sinhala, through the Google Cloud Translation API
 * (Basic, v2), for the agreement fields that are words rather than names.
 *
 * The key stays on the server: the browser asks this app, and this app asks
 * Google. Nothing is translated without a key - the screen then says so and
 * every language can still be typed by hand.
 */
class TranslationService
{
    private const ENDPOINT = 'https://translation.googleapis.com/language/translate/v2';

    /** The languages an agreement is printed in besides English, as Google names them. */
    public const TARGETS = ['he' => 'he', 'si' => 'si'];

    public static function configured(): bool
    {
        return (string) config('services.google_translate.key') !== '';
    }

    /**
     * Translates each English text into every target language.
     *
     * @param  string[]  $texts
     * @return array<string, string[]> language => translations, in the same order
     */
    public static function fromEnglish(array $texts): array
    {
        if (! self::configured()) {
            throw new ApiException(503, 'Translation is not set up yet. Add GOOGLE_TRANSLATE_API_KEY to .env, '
                .'or type the Hebrew and Sinhala by hand.');
        }

        $out = [];

        foreach (self::TARGETS as $lang => $googleCode) {
            // A JSON body carries q as a list; form fields would send q[0]=,
            // which the API does not read.
            $response = Http::timeout(15)->post(self::ENDPOINT.'?key='.urlencode((string) config('services.google_translate.key')), [
                'source' => 'en',
                'target' => $googleCode,
                // Plain text back, so an ampersand is not handed over as &amp;.
                'format' => 'text',
                'q' => array_values($texts),
            ]);

            if (! $response->successful()) {
                $reason = $response->json('error.message') ?: 'HTTP '.$response->status();

                throw new ApiException(502, 'The translation service refused the request: '.$reason);
            }

            $out[$lang] = array_map(
                fn ($row) => (string) ($row['translatedText'] ?? ''),
                $response->json('data.translations', [])
            );
        }

        return $out;
    }
}
