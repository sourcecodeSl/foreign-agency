<?php

namespace App\Support;

/**
 * The pages the Main Admin can open to a coordinator, one person at a time.
 *
 * A coordinator has no permission matrix of their own. Each page opened to
 * them grants exactly the matrix cells that page needs, and nothing else.
 * Users, roles, permissions and the coordinator list itself are never on
 * offer, so a coordinator cannot widen anybody's access - their own included.
 */
final class PageAccess
{
    public const ROLE = 'coordinator';

    /** Roles that work across agencies rather than inside one. */
    public const CROSS_AGENCY_ROLES = ['main_admin', 'auditor', self::ROLE];

    public const REFUSAL = 'This page has not been opened to you. Ask the Main Admin for access.';

    /**
     * In menu order. `grants` are the matrix cells the page needs, as
     * module => actions; pages outside the matrix are guarded by can.page.
     */
    public const PAGES = [
        'dashboard' => [
            'label' => 'Dashboard',
            'section' => 'Overview',
            'description' => 'Totals, and the agencies waiting for approval.',
            'grants' => ['agencies' => ['view']],
        ],
        'agencies' => [
            'label' => 'Agency List',
            'section' => 'Agency Management',
            'description' => 'Every agency: approve or deactivate it, edit its details and reset its login.',
            'grants' => ['agencies' => ['view', 'edit']],
        ],
        'agencies.create' => [
            'label' => 'Create Agency',
            'section' => 'Agency Management',
            'description' => 'Register a new local or foreign company and issue its login.',
            'grants' => ['agencies' => ['create']],
        ],
        'candidates' => [
            'label' => 'Candidates by Agency',
            'section' => 'Candidates',
            'description' => "Read any agency's candidate files, register candidates for an agency, "
                ."and check a passed candidate's documents and submit the profile.",
            // The page picks an agency first, so it reads the agency list too.
            // Submitting a profile is guarded by can.page, not by a matrix cell.
            'grants' => ['agencies' => ['view'], 'candidates' => ['view', 'create']],
        ],
        'companies' => [
            'label' => 'Foreign Companies',
            'section' => 'Foreign Agent Management',
            'description' => 'The overseas companies this coordinator manages, their skill tests and passed candidates.',
            // Booking a test reads the candidate pool and the agency names.
            'grants' => ['agencies' => ['view'], 'candidates' => ['view']],
        ],
        'agreements' => [
            'label' => 'Employment Agreements',
            'section' => 'Agreements',
            'description' => 'Upload the agreement PDF and fill copies of it in English, Hebrew and Sinhala.',
            // Guarded by can.page; the agreements sit outside the matrix.
            'grants' => [],
        ],
        'verification' => [
            'label' => 'Email Verification',
            'section' => 'Verification',
            'description' => 'Which agencies have confirmed their phone and email, and confirmation links.',
            'grants' => [],
        ],
    ];

    public static function keys(): array
    {
        return array_keys(self::PAGES);
    }

    /** Known pages only, each once, in menu order. */
    public static function clean(array $pages): array
    {
        return array_values(array_intersect(self::keys(), array_filter($pages, 'is_string')));
    }

    /** Whether any of the pages grants this matrix cell. */
    public static function allows(array $pages, string $module, string $action): bool
    {
        foreach (self::clean($pages) as $page) {
            if (in_array($action, self::PAGES[$page]['grants'][$module] ?? [], true)) {
                return true;
            }
        }

        return false;
    }

    /** What the Coordinators screen offers, without the grants behind it. */
    public static function catalogue(): array
    {
        return array_map(fn (string $key) => [
            'key' => $key,
            'label' => self::PAGES[$key]['label'],
            'section' => self::PAGES[$key]['section'],
            'description' => self::PAGES[$key]['description'],
        ], self::keys());
    }
}
