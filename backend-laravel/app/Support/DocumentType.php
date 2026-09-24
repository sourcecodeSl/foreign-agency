<?php

namespace App\Support;

/**
 * The documents an agency attaches to a candidate profile.
 *
 * Defined once here and reused by the migration enum, the upload validation
 * and the checklist the API hands the frontend, so the list never drifts.
 */
enum DocumentType: string
{
    case PassportCopy = 'passport_copy';
    case NicCopy = 'nic_copy';
    case OnlinePoliceReport = 'online_police_report';
    case Medical = 'medical';
    case AffidavitEnglish = 'affidavit_english';
    case AffidavitSinhala = 'affidavit_sinhala';
    case FamilyAffidavitEnglish = 'family_affidavit_english';
    case FamilyAffidavitSinhala = 'family_affidavit_sinhala';
    case Agreement = 'agreement';

    public function label(): string
    {
        return match ($this) {
            self::PassportCopy => 'Passport Copy',
            self::NicCopy => 'NIC Copy',
            self::OnlinePoliceReport => 'Online Police Report',
            self::Medical => 'Medical',
            self::AffidavitEnglish => 'Affidavit English',
            self::AffidavitSinhala => 'Affidavit Sinhala',
            self::FamilyAffidavitEnglish => 'Family Affidavit English',
            self::FamilyAffidavitSinhala => 'Family Affidavit Sinhala',
            self::Agreement => 'Agreement',
        };
    }

    /**
     * Whether the profile can be submitted without it. The NIC copy is
     * welcome but optional; every other document is required.
     */
    public function required(): bool
    {
        return $this !== self::NicCopy;
    }

    /** @return array<int, string> Every type an upload may be. */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }

    /** @return array<int, string> The types a profile needs before it is submitted. */
    public static function requiredValues(): array
    {
        return array_values(array_map(
            fn (self $case) => $case->value,
            array_filter(self::cases(), fn (self $case) => $case->required())
        ));
    }

    /** Shape the frontend renders as the upload checklist. */
    public static function options(): array
    {
        return array_map(
            fn (self $case) => ['value' => $case->value, 'label' => $case->label(), 'required' => $case->required()],
            self::cases()
        );
    }
}
