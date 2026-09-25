<?php

namespace App\Models;

use App\Support\DocumentType;
use App\Support\Nic;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A candidate never signs in, so there is no password and no OTP here. Every
 * record is owned by exactly one agency, whether the agency filed it or a
 * coordinator filed it on the agency's behalf.
 *
 * A person is known across agencies by NIC. Until they pass, the same person
 * may be on file with several agencies. Passing ties them to the one agency
 * that holds the pass: only then are documents attached, every other
 * agency's file for that NIC is blocked, and no other agency can take them on.
 */
class Candidate extends Model
{
    use SoftDeletes;

    /** Who put the candidate on file, as the screens name it. */
    public const SOURCES = [
        'agency' => 'Agency',
        'coordinator' => 'Coordinator',
        'main_admin' => 'Main Admin',
    ];

    /** Once the coordinator has submitted the profile, its documents are settled. */
    public const LOCKED_STATUSES = ['submitted', 'approved'];

    protected $table = 'candidates';

    protected $guarded = [];

    protected $casts = [
        'passed_at' => 'datetime',
        'registration_blocked_at' => 'datetime',
        'submitted_at' => 'datetime',
        'date_of_birth' => 'date:Y-m-d',
        'passport_expiry' => 'date:Y-m-d',
        'police_issued_date' => 'date:Y-m-d',
    ];

    /** How long a police report is good for, from the day it was issued. */
    public const POLICE_VALID_MONTHS = 6;

    /** Less than this left on a police report, and the file is warned about. */
    public const POLICE_WARN_MONTHS = 2;

    /** A passport is expected to have at least this long left on it. */
    public const PASSPORT_WANTED_YEARS = 3;

    /** Whether the pass held elsewhere has been looked up, and what was found. */
    protected bool $holderResolved = false;

    protected ?Candidate $holder = null;

    protected static function booted(): void
    {
        // The person's key follows the NIC, whichever format it is written in.
        static::saving(function (Candidate $candidate) {
            $candidate->nic_key = Nic::key($candidate->nic_no);
            // Read from the NIC, never typed in.
            $candidate->date_of_birth = Nic::birthDate($candidate->nic_no);
        });
    }

    /** The `source` a new file gets from the role of whoever registers it. */
    public static function sourceFor(?string $roleSlug): string
    {
        return in_array($roleSlug, ['coordinator', 'main_admin'], true) ? $roleSlug : 'agency';
    }

    public function documents(): HasMany
    {
        return $this->hasMany(CandidateDocument::class);
    }

    /** Set once the candidate passes: they belong to this foreign company alone. */
    public function lockedCompany(): BelongsTo
    {
        return $this->belongsTo(ForeignCompany::class, 'locked_company_id');
    }

    /**
     * The foreign company this candidate was registered to be tested for:
     * an agency of type foreign, which signs in and reads its own list.
     */
    public function companyAgency(): BelongsTo
    {
        return $this->belongsTo(Agency::class, 'company_agency_id');
    }

    /** The trade a recorded pass was sat in. */
    public function testResultRole(): BelongsTo
    {
        return $this->belongsTo(JobRole::class, 'test_result_role_id');
    }

    /** The trade this candidate was first registered for. */
    public function jobRole(): BelongsTo
    {
        return $this->belongsTo(JobRole::class, 'job_role_id');
    }

    /**
     * Every trade this candidate can be tested for, in the order they were
     * added. Failing one trade leaves the others open, on the same file.
     */
    public function jobRoles(): BelongsToMany
    {
        return $this->belongsToMany(JobRole::class, 'candidate_job_roles', 'candidate_id', 'job_role_id')
            ->withTimestamps()
            ->orderBy('candidate_job_roles.id');
    }

    /**
     * Adds trades to the file, keeping the ones already there. The first
     * trade ever given also becomes the one the file is registered for.
     *
     * @param  array<int|string>  $roleIds
     */
    public function addJobRoles(array $roleIds): void
    {
        $roleIds = array_values(array_unique(array_map('intval', array_filter($roleIds))));
        if ($roleIds === []) {
            return;
        }

        $this->jobRoles()->syncWithoutDetaching($roleIds);
        $this->unsetRelation('jobRoles');

        if (! $this->job_role_id) {
            $this->job_role_id = $roleIds[0];
            $this->save();
        }
    }

    /** The account that registered the candidate. */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** The coordinator (or Main Admin) who submitted the profile. */
    public function submitter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    /**
     * How the test went in each job category, one row per trade. The local
     * agency reads them all; the latest also sits on the candidate itself.
     */
    public function categoryResults(): HasMany
    {
        return $this->hasMany(CandidateTestResult::class)->orderBy('id');
    }

    /**
     * Every foreign company this candidate is registered with, each for its
     * own job categories, in the order they were added.
     */
    public function registrations(): HasMany
    {
        return $this->hasMany(CandidateRegistration::class)->orderBy('id');
    }

    /**
     * The current assignment with one foreign company, if there is one. An
     * ended one - moved on from, or replaced by a new test - is history.
     */
    public function registrationFor(?string $companyAgencyId): ?CandidateRegistration
    {
        if (! $companyAgencyId) {
            return null;
        }

        return $this->registrations
            ->filter(fn (CandidateRegistration $registration) => $registration->isCurrent())
            ->last(fn (CandidateRegistration $registration) => $registration->company_agency_id === $companyAgencyId);
    }

    /** The assignments still running, oldest first. */
    public function currentRegistrations()
    {
        return $this->registrations->filter(fn (CandidateRegistration $registration) => $registration->isCurrent())->values();
    }

    /** Whether the candidate is currently put up with this company, approved or not. */
    public function isRegisteredWith(?string $companyAgencyId): bool
    {
        return $this->registrationFor($companyAgencyId) !== null;
    }

    /**
     * Whether this foreign company may open the file: registered with it and
     * approved, or still waiting for it (or the admin side) to approve. One
     * sent back is the local agency's again.
     */
    public function isVisibleToCompany(?string $companyAgencyId): bool
    {
        $registration = $this->registrationFor($companyAgencyId);

        return $registration !== null && $registration->approval !== CandidateRegistration::REJECTED;
    }

    /**
     * Whether this foreign company has the candidate on its list: the
     * registration has been approved by a coordinator or the Main Admin.
     */
    public function isApprovedWith(?string $companyAgencyId): bool
    {
        return (bool) $this->registrationFor($companyAgencyId)?->isApproved();
    }

    /**
     * Puts the candidate up with a company for these trades - added to the
     * current assignment with it, or a new one. The company becomes the one
     * the file shows.
     *
     * @param  int[]  $roleIds
     */
    public function registerWith(string $companyAgencyId, array $roleIds, ?int $by = null, bool $approved = false): CandidateRegistration
    {
        // By a coordinator or the Main Admin it is approved as it is made, and
        // the test numbers come out; anything else waits for their approval.
        $registration = $this->registrations()->current()->where('company_agency_id', $companyAgencyId)->latest('id')->first()
            ?? $this->registrations()->create(['company_agency_id' => $companyAgencyId, 'created_by' => $by] + ($approved
                ? ['approval' => CandidateRegistration::APPROVED, 'decided_at' => now(), 'decided_by' => $by]
                : ['approval' => CandidateRegistration::PENDING]));
        $registration->jobRoles()->syncWithoutDetaching($roleIds);
        $registration->assignTestIndexes();

        // The file shows the company the candidate was last sent to.
        if ($this->company_agency_id !== $companyAgencyId && ! $this->isPassed()) {
            $this->company_agency_id = $companyAgencyId;
            $this->save();
        }

        $this->unsetRelation('registrations');
        $this->syncJobRolesFromRegistrations();

        return $registration;
    }

    /**
     * The file's own list of trades - what the agency said the candidate can
     * do - takes in every trade they were assigned or tested in. It only
     * grows: a trade taken off one company's list stays on the file.
     */
    public function syncJobRolesFromRegistrations(): void
    {
        $ids = CandidateRegistration::query()
            ->where('candidate_id', $this->id)
            ->join('candidate_registration_roles', 'candidate_registration_roles.registration_id', '=', 'candidate_registrations.id')
            ->orderBy('candidate_registration_roles.id')
            ->pluck('candidate_registration_roles.job_role_id')
            ->merge($this->tests()->pluck('job_role_id'))
            ->merge($this->categoryResults()->pluck('job_role_id'))
            ->map(fn ($id) => (int) $id)
            ->unique()->values()->all();

        if ($ids === []) {
            return;
        }

        $this->jobRoles()->syncWithoutDetaching($ids);
        $this->unsetRelation('jobRoles');

        if (! $this->job_role_id) {
            $this->job_role_id = $ids[0];
            $this->save();
        }
    }

    /** The passed file this one was blocked for, when a block was made. */
    public function blockedFor(): BelongsTo
    {
        return $this->belongsTo(Candidate::class, 'registration_blocked_for')->withTrashed();
    }

    /**
     * Blocked by hand: the person passed with another company, and that
     * company or the admin side shut this registration.
     */
    public function isRegistrationBlocked(): bool
    {
        return $this->registration_blocked_at !== null;
    }

    /** Every skill test attempt, newest first. */
    public function tests(): HasMany
    {
        return $this->hasMany(SkillTest::class)->orderByDesc('id');
    }

    /**
     * Restricts a query to one agency. Agency staff are always scoped through
     * this; passing null (Main Admin, auditor) returns every agency.
     */
    public function scopeForAgency(Builder $query, ?string $agencyId): Builder
    {
        return $agencyId === null ? $query : $query->where('agency_id', $agencyId);
    }

    /** The same person, known by NIC in either format. No NIC, no match. */
    public function scopeSamePerson(Builder $query, ?string $nicNo): Builder
    {
        $key = Nic::key($nicNo);

        return $key === null ? $query->whereRaw('1 = 0') : $query->where('nic_key', $key);
    }

    /**
     * The file under another agency where this person has already passed.
     *
     * A removed file does not count: once the agency has taken the person
     * off its register, they are free again.
     */
    public static function passedHolder(string $agencyId, ?string $nicNo): ?self
    {
        return static::query()
            ->where('pool_status', 'passed')
            ->where('agency_id', '!=', $agencyId)
            ->samePerson($nicNo)
            ->first();
    }

    /** The file where this person has passed with some other agency, if any. */
    public function passedElsewhere(): ?self
    {
        if (! $this->holderResolved) {
            $this->holder = static::passedHolder($this->agency_id, $this->nic_no);
            $this->holderResolved = true;
        }

        return $this->holder;
    }

    /**
     * Blocked: this file is not passed, but the same NIC has passed with
     * another agency. Nothing more happens here - no pass, no documents, no
     * edits - until that agency lets the person go.
     */
    public function isBlocked(): bool
    {
        if ($this->isRegistrationBlocked()) {
            return true;
        }

        return ! $this->isPassed() && $this->passedElsewhere() !== null;
    }

    /** Looks up the passes held elsewhere for a whole listing in one query. */
    public static function resolveBlocks(Collection $candidates): void
    {
        $keys = $candidates->reject(fn (Candidate $c) => $c->isPassed())
            ->pluck('nic_key')->filter()->unique()->values();

        $passed = $keys->isEmpty()
            ? collect()
            : static::query()->where('pool_status', 'passed')->whereIn('nic_key', $keys)->get()->groupBy('nic_key');

        foreach ($candidates as $candidate) {
            $candidate->holder = $candidate->isPassed() || ! $candidate->nic_key
                ? null
                : ($passed[$candidate->nic_key] ?? collect())
                    ->first(fn (Candidate $row) => $row->agency_id !== $candidate->agency_id);
            $candidate->holderResolved = true;
        }
    }

    /** Other agencies' files for this person, blocked once this one passes. */
    public function filesElsewhere(): Builder
    {
        return static::query()->where('agency_id', '!=', $this->agency_id)->samePerson($this->nic_no);
    }

    public function isPassed(): bool
    {
        return $this->pool_status === 'passed';
    }

    /**
     * Whether the agency may attach the police report itself. Unlike the
     * other documents it does not wait for the pass: once the report is
     * applied for or received, the file can go on - from the registration
     * form onwards - until the profile is submitted.
     */
    public function policeDocumentOpen(): bool
    {
        return $this->policeApplied()
            && ! $this->isBlocked()
            && ! in_array($this->status, self::LOCKED_STATUSES, true);
    }

    /**
     * Whether the agency may attach documents: only to a candidate who has
     * passed, and only until the coordinator has submitted the profile.
     */
    public function documentsOpen(): bool
    {
        return $this->isPassed()
            && $this->policeApplied()
            && ! in_array($this->status, self::LOCKED_STATUSES, true);
    }

    /**
     * The police report has at least been applied for. Until it is, a passed
     * candidate's documents stay closed.
     */
    public function policeApplied(): bool
    {
        return in_array($this->police_status, ['applied', 'received'], true);
    }

    /**
     * The mobile number and email belong to the local agency that registered
     * the candidate. Nobody else - not a coordinator, the Main Admin, a
     * foreign company or another agency - is shown them.
     */
    public static function contactAgency(): ?string
    {
        $auth = request()->attributes->get('auth_user');

        return $auth['agencyId'] ?? null;
    }

    public function contactVisible(): bool
    {
        $viewer = self::contactAgency();

        return $viewer !== null && $viewer === $this->agency_id;
    }

    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        $term = trim((string) $term);
        if ($term === '') {
            return $query;
        }

        $like = '%'.$term.'%';

        return $query->where(function (Builder $q) use ($like) {
            $q->where('name', 'like', $like)
                ->orWhere('passport_no', 'like', $like)
                ->orWhere('nic_no', 'like', $like)
                // By mobile or email only in the agency's own files.
                ->orWhere(fn (Builder $own) => $own->where('agency_id', self::contactAgency() ?? '')
                    ->where(fn (Builder $c) => $c->where('mobile', 'like', $like)->orWhere('email', 'like', $like)))
                ->orWhere('test_index_no', 'like', $like)
                // The index number of any trade it is registered for, TL00001.
                ->orWhereExists(fn ($sub) => $sub->from('candidate_registrations')
                    ->join('candidate_registration_roles', 'candidate_registration_roles.registration_id', '=', 'candidate_registrations.id')
                    ->whereColumn('candidate_registrations.candidate_id', 'candidates.id')
                    ->where('candidate_registration_roles.test_index_no', 'like', $like));
        });
    }

    /**
     * Which required documents are not usable.
     *
     * A row on its own is not enough: the current file has to be readable on
     * disk, otherwise the candidate would count as complete and become
     * submittable while the documents cannot actually be downloaded.
     */
    public function missingDocumentTypes(): array
    {
        $present = [];

        foreach ($this->latestDocumentsByType() as $type => $document) {
            if ($document->fileExists()) {
                $present[] = $type;
            }
        }

        // Only the required ones: an optional document (the NIC copy) never holds a profile back.
        return array_values(array_diff(DocumentType::requiredValues(), $present));
    }

    /**
     * The newest upload for each document type.
     *
     * Every upload is kept, so "the current file" is simply the highest id
     * within a type. Keyed by type value.
     *
     * @return array<string, CandidateDocument>
     */
    public function latestDocumentsByType(): array
    {
        $latest = [];

        foreach ($this->documents()->orderBy('id')->get() as $document) {
            $latest[$document->type] = $document;   // later rows overwrite earlier
        }

        return $latest;
    }

    /** History for one type, newest first. */
    public function documentHistory(string $type)
    {
        return $this->documents()->where('type', $type)->orderByDesc('id')->get();
    }

    /**
     * Why the passport is a problem, or null when it is fine.
     *
     * Short validity never stops a file being saved - plenty of candidates
     * travel on a passport with a year or two left - but it is said out loud
     * every time the file is opened, so nobody is surprised at the embassy.
     */
    public function passportWarning(): ?string
    {
        if (! $this->passport_expiry) {
            return null;
        }

        $expiry = $this->passport_expiry;

        if ($expiry->isPast()) {
            return 'The passport expired on '.$expiry->format('j M Y').'.';
        }

        if ($expiry->lt(now()->addYears(self::PASSPORT_WANTED_YEARS))) {
            return 'The passport is valid until '.$expiry->format('j M Y').', which is less than '
                .self::PASSPORT_WANTED_YEARS.' years away.';
        }

        return null;
    }

    /** The day the police report runs out: six months after it was issued. */
    public function policeExpiry(): ?\Carbon\CarbonInterface
    {
        return $this->police_issued_date?->copy()->addMonths(self::POLICE_VALID_MONTHS);
    }

    /**
     * Why the police report is a problem, or null when it is fine. As with
     * the passport, it is a warning and never stops the file being saved.
     */
    public function policeWarning(): ?string
    {
        if ($this->police_status !== 'received' || ! $this->police_issued_date) {
            return null;
        }

        $expiry = $this->policeExpiry();

        if ($expiry->isPast()) {
            return 'The police report expired on '.$expiry->format('j M Y').'.';
        }

        if ($expiry->lt(now()->addMonths(self::POLICE_WARN_MONTHS))) {
            return 'The police report expires on '.$expiry->format('j M Y').', which is less than '
                .self::POLICE_WARN_MONTHS.' months away.';
        }

        return null;
    }

    /** The police report as the screens show it. */
    public function policeReport(): array
    {
        return [
            'status' => $this->police_status ?? 'not_applied',
            'referenceNo' => $this->police_reference_no,
            'issuedDate' => $this->police_issued_date?->toDateString(),
            'expiresOn' => $this->policeExpiry()?->toDateString(),
            'warning' => $this->policeWarning(),
        ];
    }

    /** camelCase shape, matching the rest of the API. */
    public function toPublic(bool $withDocuments = false): array
    {
        $payload = [
            'id' => $this->id,
            'agencyId' => $this->agency_id,
            'name' => $this->name,
            'firstName' => $this->first_name,
            'lastName' => $this->last_name,
            'fatherName' => $this->father_name,
            'dateOfBirth' => $this->date_of_birth?->toDateString(),
            'age' => $this->date_of_birth?->age,
            'passportNo' => $this->passport_no,
            'passportExpiry' => $this->passport_expiry?->toDateString(),
            'passportWarning' => $this->passportWarning(),
            'policeReport' => $this->policeReport(),
            'profession' => $this->profession,
            'testResults' => $this->test_results,
            'nicNo' => $this->nic_no,
            'address' => $this->address,
            // Only the registering agency sees how to reach the candidate.
            'mobile' => $this->contactVisible() ? $this->mobile : null,
            'email' => $this->contactVisible() ? $this->email : null,
            'contactHidden' => ! $this->contactVisible(),
            // The trade they are put forward for, and the agency's own number
            // for the test sheet.
            'jobRoleId' => $this->job_role_id,
            'jobRole' => $this->jobRole?->name,
            // Every trade on the file; a failed test in one leaves the rest open.
            'jobRoles' => $this->jobRoles->map(fn (JobRole $role) => [
                'id' => $role->id,
                'name' => $role->name,
            ])->values()->all(),
            'testIndexNo' => $this->test_index_no,
            'status' => $this->status,
            // Where the file came from: the agency itself, or a coordinator
            // (or the Main Admin) filing on the agency's behalf.
            'registeredBy' => [
                'source' => $this->source ?? 'agency',
                'label' => self::SOURCES[$this->source ?? 'agency'] ?? 'Agency',
                'name' => $this->creator?->name,
            ],
            'passedAt' => $this->passed_at,
            // Passed with another agency under the same NIC: this file is shut.
            'blocked' => $this->isBlocked(),
            'documentsOpen' => $this->documentsOpen(),
            // The police report file alone may go on before the pass.
            'policeDocumentOpen' => $this->policeDocumentOpen(),
            'submittedAt' => $this->submitted_at,
            'submittedBy' => $this->submitted_by ? $this->submitter?->name : null,
            // Where the candidate stands in the testing pool, and the foreign
            // agency that holds them once they have passed.
            'poolStatus' => $this->pool_status ?? 'pool',
            // Chosen when the candidate was registered: whose test they are
            // waiting for, and how that company said it went.
            'company' => $this->company_agency_id ? [
                'id' => $this->company_agency_id,
                'name' => $this->companyAgency?->name,
                'code' => $this->companyAgency?->code,
            ] : null,
            // Every company the candidate is put up with, its trades, and how
            // each went. Only the company holding a pass stays valid.
            'registrations' => $this->registrations
                ->each(fn (CandidateRegistration $registration) => $registration->setRelation('candidate', $this))
                ->map(fn (CandidateRegistration $registration) => $registration->toPublic())
                ->values()->all(),
            // One result per job category, pass or fail, for the agency to read.
            'categoryResults' => $this->categoryResults
                ->map(fn (CandidateTestResult $result) => $result->toPublic())->values()->all(),
            // Shut by the company that holds this person's pass, or the admin side.
            'registrationBlocked' => $this->registration_blocked_at ? [
                'at' => $this->registration_blocked_at,
                'company' => $this->blockedFor?->companyAgency?->name,
            ] : null,
            'testResult' => $this->test_result ? [
                'result' => $this->test_result,
                'jobRole' => $this->testResultRole?->name,
                'note' => $this->test_result_note,
                'recordedAt' => $this->test_result_at,
            ] : null,
            'lockedCompany' => $this->locked_company_id ? [
                'id' => (int) $this->locked_company_id,
                'name' => $this->lockedCompany?->name,
                'code' => $this->lockedCompany?->code,
            ] : null,
            'latestTest' => $this->relationLoaded('tests') ? $this->tests->first()?->toPublic() : null,
            // Every attempt, newest first, each under its own test number.
            'tests' => $this->relationLoaded('tests') ? $this->tests->map->toPublic()->values()->all() : [],
            'notes' => $this->notes,
            'createdAt' => $this->created_at,
            'updatedAt' => $this->updated_at,
        ];

        if ($withDocuments) {
            $latest = $this->latestDocumentsByType();

            // Full history, plus a flag marking the current file of each type.
            $payload['documents'] = $this->documents
                ->sortByDesc('id')
                ->map(fn ($d) => $d->toPublic() + [
                    'isLatest' => isset($latest[$d->type]) && $latest[$d->type]->id === $d->id,
                ])
                ->values()
                ->all();

            $payload['latestDocuments'] = array_map(
                fn ($d) => $d->toPublic(),
                $latest
            );
            $payload['missingDocuments'] = $this->missingDocumentTypes();
        }

        return $payload;
    }
}
