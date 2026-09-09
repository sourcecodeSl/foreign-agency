<?php

namespace App\Enums;

/**
 * The documents an agency attaches to a candidate profile.
 *
 * The order here is the order the UI should present them in, and the value is
 * what the API accepts in the `type` field.
 */
enum DocumentType: string
{
    case PassportCopy = 'passport_copy';
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
            self::OnlinePoliceReport => 'Online Police Report',
            self::Medical => 'Medical',
            self::AffidavitEnglish => 'Affidavit English',
            self::AffidavitSinhala => 'Affidavit Sinhala',
            self::FamilyAffidavitEnglish => 'Family Affidavit English',
            self::FamilyAffidavitSinhala => 'Family Affidavit Sinhala',
            self::Agreement => 'Agreement',
        };
    }

    /** @return array<int, string> */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }

    /** Shape used by the frontend to render the upload checklist. */
    public static function options(): array
    {
        return array_map(
            fn (self $case) => ['value' => $case->value, 'label' => $case->label()],
            self::cases()
        );
    }
}
