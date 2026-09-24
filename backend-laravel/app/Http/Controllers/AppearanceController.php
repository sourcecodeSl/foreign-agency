<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The signed-in person's own look of the interface. Every role has one - the
 * admin side, a foreign company and a local agency alike - and nobody reads
 * or changes anyone else's.
 */
class AppearanceController extends Controller
{
    /** What a login gets until it chooses otherwise. */
    public const DEFAULTS = [
        'mode' => 'light',
        'accent' => 'blue',
        'sidebar' => 'default',
        'textSize' => 'default',
        // Used when the accent or the sidebar is set to "custom".
        'customAccent' => '#3363ff',
        'sidebarColor' => '#1a288f',
    ];

    public const MODES = ['light', 'dark', 'system'];

    public const ACCENTS = ['blue', 'indigo', 'violet', 'emerald', 'teal', 'rose', 'orange', 'slate', 'custom'];

    public const SIDEBARS = ['default', 'dark', 'brand', 'custom'];

    /** A colour picked by hand: #rrggbb. */
    private const HEX = '/^#[0-9a-fA-F]{6}$/';

    public const TEXT_SIZES = ['small', 'default', 'large'];

    /** GET /account/appearance */
    public function show(Request $request)
    {
        return ApiResponse::ok($this->current($request->attributes->get('auth_account')));
    }

    /**
     * PUT /account/appearance  { mode?, accent?, sidebar?, textSize?, customAccent?, sidebarColor? }
     *
     * Only what is sent changes. A colour picked by hand is kept as #rrggbb.
     */
    public function update(Request $request)
    {
        $data = $request->validate([
            'mode' => ['sometimes', Rule::in(self::MODES)],
            'accent' => ['sometimes', Rule::in(self::ACCENTS)],
            'sidebar' => ['sometimes', Rule::in(self::SIDEBARS)],
            'textSize' => ['sometimes', Rule::in(self::TEXT_SIZES)],
            'customAccent' => ['sometimes', 'string', 'regex:'.self::HEX],
            'sidebarColor' => ['sometimes', 'string', 'regex:'.self::HEX],
        ], [
            'mode.in' => 'Choose light, dark or system.',
            'accent.in' => 'Choose one of the colours on offer.',
            'sidebar.in' => 'Choose one of the sidebar styles on offer.',
            'textSize.in' => 'Choose small, default or large text.',
            'customAccent.regex' => 'Enter the colour as #rrggbb, such as #3363ff.',
            'sidebarColor.regex' => 'Enter the colour as #rrggbb, such as #1a288f.',
        ]);

        // Kept in one form, so the same colour always reads the same.
        foreach (['customAccent', 'sidebarColor'] as $key) {
            if (isset($data[$key])) {
                $data[$key] = strtolower($data[$key]);
            }
        }

        /** @var User $user */
        $user = $request->attributes->get('auth_account');
        $user->appearance = array_merge($this->current($user), $data);
        $user->save();

        return ApiResponse::ok($user->appearance, 'Appearance saved.');
    }

    /** The saved choices over the defaults, ignoring anything no longer on offer. */
    private function current(?User $user): array
    {
        $saved = is_array($user?->appearance) ? $user->appearance : [];

        return array_merge(self::DEFAULTS, array_intersect_key($saved, self::DEFAULTS));
    }
}
