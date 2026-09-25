<?php

namespace App\Models;

use App\Support\AgreementLayout;
use App\Support\CandidateDetails;
use App\Support\EmployerDetails;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One filled agreement: every field in English, Hebrew and Sinhala.
 *
 * `auto` marks the Hebrew or Sinhala that came from the translation service
 * and has not been touched by a person since - the screen shows those as
 * needing a check.
 *
 * A foreign company's agreement (agency_id set) also moves along a status:
 * draft, then sent to the admin side, then passed by it to one local agency,
 * which assigns one of its candidates to it.
 */
class Agreement extends Model
{
    public const DRAFT = 'draft';

    public const SENT_TO_ADMIN = 'sent_to_admin';

    public const SENT_TO_AGENCY = 'sent_to_agency';

    protected $table = 'agreements';

    protected $guarded = [];

    protected $casts = [
        'field_values' => 'array',
        'sent_to_admin_at' => 'datetime',
        'sent_to_agency_at' => 'datetime',
        'candidate_assigned_at' => 'datetime',
        'salary_nis' => 'decimal:2',
    ];

    /** The foreign company the copy belongs to; none for the admin side's own. */
    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class, 'agency_id');
    }

    /** The local agency the admin side passed it to. */
    public function localAgency(): BelongsTo
    {
        return $this->belongsTo(Agency::class, 'local_agency_id');
    }

    /** The local agency's candidate the employee part is filled from. */
    public function candidate(): BelongsTo
    {
        return $this->belongsTo(Candidate::class, 'candidate_id');
    }

    public function template(): BelongsTo
    {
        return $this->belongsTo(AgreementTemplate::class, 'template_id');
    }

    /** How many translated values are still waiting for a person to check them. */
    public function uncheckedCount(): int
    {
        $count = 0;
        foreach ((array) $this->field_values as $value) {
            $count += count(array_filter((array) ($value['auto'] ?? [])));
        }

        return $count;
    }

    public function toPublic(bool $withTemplate = false): array
    {
        $payload = [
            'id' => $this->id,
            'templateId' => $this->template_id,
            'templateName' => $this->template?->name,
            'agencyId' => $this->agency_id,
            'agencyName' => $this->agency?->name,
            'status' => $this->status ?? self::DRAFT,
            'salaryNis' => $this->salary_nis,
            // The pictures stay on a private disk; only whether each is there.
            'marks' => ['seal' => (bool) $this->seal_path, 'signature' => (bool) $this->signature_path],
            'sentToAdminAt' => $this->sent_to_admin_at,
            'localAgencyId' => $this->local_agency_id,
            'localAgencyName' => $this->localAgency?->name,
            'sentToAgencyAt' => $this->sent_to_agency_at,
            'candidateId' => $this->candidate_id,
            'candidateName' => $this->candidate?->name,
            'candidateAssignedAt' => $this->candidate_assigned_at,
            'title' => $this->title,
            // An empty object, not a list, when nothing is filled yet.
            'values' => (object) ($this->field_values ?? []),
            'unchecked' => $this->uncheckedCount(),
            'createdAt' => $this->created_at,
            'updatedAt' => $this->updated_at,
        ];

        if ($withTemplate && $this->template) {
            $payload['template'] = $this->template->toPublic(true);
            // Where the values go on the original PDF, for the filled copy.
            $payload['blanks'] = (object) AgreementLayout::blanks($this->template->layout);
            $payload['markBoxes'] = (object) AgreementLayout::marks($this->template->layout);
            // The agreement's name takes the place of the printed heading.
            $payload['heading'] = AgreementLayout::heading($this->template->layout);
        }

        // A company's agreement is shown as the employer part alone.
        if ($withTemplate && $this->agency_id) {
            $payload['employerSection'] = EmployerDetails::section();
            $payload['employeeSection'] = CandidateDetails::section();
            // The salary, as clause 3a prints it in each language.
            $payload['salarySection'] = [
                'key' => 'salary',
                'fields' => [[
                    'key' => 'salary',
                    'kind' => 'text',
                    'multiline' => true,
                    'label' => ['en' => 'Monthly salary (3a)', 'he' => 'שכר חודשי (3א)', 'si' => 'මාසික වැටුප (3a)'],
                ]],
            ];
        }

        return $payload;
    }
}
