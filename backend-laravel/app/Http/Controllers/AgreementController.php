<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Models\Agency;
use App\Models\Agreement;
use App\Models\AgreementTemplate;
use App\Models\Candidate;
use App\Models\User;
use App\Services\TranslationService;
use App\Support\AgreementLayout;
use App\Support\ApiResponse;
use App\Support\CandidateDetails;
use App\Support\EmployerDetails;
use App\Support\PageAccess;
use App\Support\SalaryWords;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Agreements: the paper is uploaded, then copies of it are filled in English,
 * Hebrew and Sinhala.
 *
 * Three sides work here.
 *
 *   admin    the Main Admin, and a coordinator the page is opened to. Fills
 *            its own agreements from its own PDFs, and passes a foreign
 *            company's agreement on to one local agency.
 *   company  a foreign company. Uploading a PDF creates its agreement, with
 *            the employer part already filled from the company record in all
 *            three languages. It checks the Hebrew and Sinhala, then sends it
 *            to the admin side - and can still correct it after that.
 *   local    a local agency. Sees an agreement only once the admin side has
 *            passed it to that agency. It assigns one of its candidates to
 *            it, which fills the employee part from the candidate's file,
 *            and may correct that part's Hebrew and Sinhala.
 *
 * English is typed; names and numbers are copied into the other two
 * languages as they are, and the words that need it are translated through
 * TranslationService. A translated value is flagged until a person has
 * looked at it.
 */
class AgreementController extends Controller
{
    /** The longest any one language of one field may be. */
    private const MAX_VALUE = 500;

    /**
     * Who is working, as [side, agency]: the agency is null on the admin
     * side. can.page on the routes holds a coordinator to the agreements
     * page; every other agency login is sorted by its agency's type.
     */
    private function viewer(Request $request): array
    {
        $auth = $request->attributes->get('auth_user');

        if (in_array($auth['roleSlug'] ?? null, ['main_admin', PageAccess::ROLE], true)) {
            return ['admin', null];
        }

        $user = User::find($auth['sub'] ?? null);
        $agency = $user?->agency_id ? Agency::find($user->agency_id) : null;

        if (! $agency) {
            throw new ApiException(403, 'Only the Main Admin, coordinators and agencies work with agreements.');
        }

        return [($agency->type ?? 'local') === 'foreign' ? 'company' : 'local', $agency];
    }

    /** The admin side or a foreign company - the sides that upload and fill. */
    private function writer(Request $request): ?Agency
    {
        [$side, $agency] = $this->viewer($request);

        if ($side === 'local') {
            throw new ApiException(403, 'A local agency reads the agreements sent to it; it does not fill them.');
        }

        return $agency;
    }

    private function requireAdminSide(Request $request): void
    {
        if ($this->viewer($request)[0] !== 'admin') {
            throw new ApiException(403, 'Only the Main Admin and coordinators send agreements on to a local agency.');
        }
    }

    /** A disk, typed as the adapter so response() is known. */
    private function storage(string $disk): FilesystemAdapter
    {
        /** @var FilesystemAdapter */
        return Storage::disk($disk);
    }

    private function actor(Request $request): ?int
    {
        return $request->attributes->get('auth_user')['sub'] ?? null;
    }

    /** Another company's PDF is answered as not found, the same as one that does not exist. */
    private function findTemplate(string $id, ?Agency $company): AgreementTemplate
    {
        $query = AgreementTemplate::query();
        if ($company) {
            $query->where('agency_id', $company->id);
        }

        return $query->find($id) ?? throw new ApiException(404, 'Agreement template not found.');
    }

    /** The agreements a side may see: all, a company's own, or those passed to a local agency. */
    private function visible(string $side, ?Agency $agency)
    {
        $query = Agreement::with('template', 'agency', 'localAgency', 'candidate');

        return match ($side) {
            'company' => $query->where('agency_id', $agency->id),
            'local' => $query->where('local_agency_id', $agency->id)->where('status', Agreement::SENT_TO_AGENCY),
            default => $query,
        };
    }

    private function findAgreement(Request $request, string $id): Agreement
    {
        [$side, $agency] = $this->viewer($request);

        return $this->visible($side, $agency)->find($id)
            ?? throw new ApiException(404, 'Agreement not found.');
    }

    /**
     * A company's agreement is the company's to change, even once sent - the
     * filled Hebrew and Sinhala may need correcting after the admin side or
     * the local agency has read it. The admin side only reads it.
     */
    private function requireEditable(Agreement $agreement, ?Agency $company): void
    {
        if ($agreement->agency_id && ! $company) {
            throw new ApiException(403, ($agreement->agency?->name ?? 'The company')
                .' fills this agreement; the admin side reads it and sends it on.');
        }
    }

    /** A new agreement, the employer part filled from the company record when it is a company's. */
    private function createAgreement(AgreementTemplate $template, string $title, ?int $actor): Agreement
    {
        $owner = $template->agency_id ? Agency::find($template->agency_id) : null;

        $values = [];
        if ($owner) {
            [$employer] = EmployerDetails::fill($owner);
            // Only what the record holds; an empty field waits for the details.
            $values = array_filter($employer, fn ($value) => $value['en'] !== '');
        }

        return Agreement::create([
            'template_id' => $template->id,
            'agency_id' => $owner?->id,
            'status' => Agreement::DRAFT,
            'title' => $title,
            'field_values' => $values,
            'created_by' => $actor,
            'updated_by' => $actor,
        ]);
    }

    // --- templates -------------------------------------------------------

    /**
     * GET /agreement-templates - the uploaded papers, and the layouts on
     * offer. The admin side lists its own; a company lists its own.
     */
    public function templates(Request $request)
    {
        $company = $this->writer($request);

        return ApiResponse::ok([
            'templates' => AgreementTemplate::with('agency')->withCount('agreements')
                ->where(fn ($q) => $company ? $q->where('agency_id', $company->id) : $q->whereNull('agency_id'))
                ->orderByDesc('id')->get()
                ->map->toPublic()->values(),
            'layouts' => collect(AgreementLayout::names())
                ->map(fn ($name, $key) => ['key' => $key, 'name' => $name])->values(),
            'translation' => TranslationService::configured(),
        ]);
    }

    /**
     * POST /agreement-templates - the PDF, and the layout its blanks follow.
     * A company's upload is its agreement too: it is created here, filled,
     * and its id comes back as agreementId. With saved, the PDF is only kept
     * for the company to start its agreements from, and none is created.
     */
    public function uploadTemplate(Request $request)
    {
        $company = $this->writer($request);

        $request->validate([
            'name' => ['required', 'string', 'min:3', 'max:150'],
            'layout' => ['required', Rule::in(array_keys(AgreementLayout::names()))],
            'file' => ['required', 'file', 'mimes:pdf', 'max:20480'],
            'saved' => ['sometimes', 'boolean'],
        ], [
            'name.required' => 'Name the agreement.',
            'layout.in' => 'Choose which agreement this is.',
            'file.mimes' => 'Upload the agreement as a PDF.',
            'file.max' => 'The PDF may not be larger than 20 MB.',
        ]);

        $file = $request->file('file');
        $disk = config('documents.disk');
        $path = $file->storeAs('agreement-templates', Str::uuid().'.pdf', ['disk' => $disk]);

        // The local disk is configured with 'throw' => false, so a failed
        // write comes back as false rather than as an exception.
        if (! is_string($path) || ! Storage::disk($disk)->exists($path)) {
            throw new ApiException(500, 'The PDF could not be saved on the server. Make sure storage/ is writable (permissions 755).');
        }

        $template = AgreementTemplate::create([
            'name' => trim($request->input('name')),
            'layout' => $request->input('layout'),
            'agency_id' => $company?->id,
            'disk' => $disk,
            'path' => $path,
            'original_name' => $file->getClientOriginalName(),
            'size_bytes' => $file->getSize(),
            'saved' => $request->boolean('saved'),
            'uploaded_by' => $this->actor($request),
        ]);

        $agreement = $company && ! $template->saved ? $this->createAgreement($template, $template->name, $this->actor($request)) : null;

        return ApiResponse::created(
            $template->load('agency')->loadCount('agreements')->toPublic() + ['agreementId' => $agreement?->id],
            $template->name.($template->saved ? ' saved.' : ' uploaded.')
        );
    }

    /** GET /agreement-templates/{id}/file - the original PDF, to read beside the form. */
    public function templateFile(Request $request, string $id)
    {
        return $this->pdf($this->findTemplate($id, $this->writer($request)));
    }

    private function pdf(AgreementTemplate $template)
    {
        if (! Storage::disk($template->disk)->exists($template->path)) {
            throw new ApiException(404, 'The PDF is missing on the server. Upload it again.');
        }

        return $this->storage($template->disk)->response($template->path, $template->original_name, [
            'Content-Type' => 'application/pdf',
        ]);
    }

    /** DELETE /agreement-templates/{id} - only while nothing has been filled from it. */
    public function deleteTemplate(Request $request, string $id)
    {
        $template = $this->findTemplate($id, $this->writer($request));

        $filled = $template->agreements()->count();

        // A saved PDF agreements were started from stays for them; it only
        // comes off the saved list.
        if ($filled > 0 && $template->saved) {
            $template->update(['saved' => false]);

            return ApiResponse::ok(['id' => (int) $id], $template->name.' removed from your saved agreements.');
        }

        if ($filled > 0) {
            throw new ApiException(409, $template->name.' has '.$filled.' filled agreement'
                .($filled === 1 ? '' : 's').'. Delete '.($filled === 1 ? 'it' : 'them').' first.');
        }

        Storage::disk($template->disk)->delete($template->path);
        $template->delete();

        return ApiResponse::ok(['id' => (int) $id], $template->name.' removed.');
    }

    // --- filled agreements -----------------------------------------------

    /**
     * GET /agreements - a company's own, or those passed to a local agency.
     *
     * The admin side reads its own; or, given any of these, what foreign
     * companies have sent it (never their drafts):
     *
     *   company      one foreign company's, or "all"
     *   status       sent_to_admin (waiting) or sent_to_agency (passed on)
     *   localAgency  those passed to one local agency
     */
    public function index(Request $request)
    {
        [$side, $agency] = $this->viewer($request);
        $query = $this->visible($side, $agency);

        if ($side === 'admin') {
            $company = (string) $request->query('company', '');
            $status = (string) $request->query('status', '');
            $local = (string) $request->query('localAgency', '');

            if ($company === '' && $status === '' && $local === '') {
                $query->whereNull('agency_id');
            } else {
                $query->whereNotNull('agency_id')->where('status', '!=', Agreement::DRAFT);

                if ($company !== '' && $company !== 'all') {
                    $query->where('agency_id', $company);
                }
                if (in_array($status, [Agreement::SENT_TO_ADMIN, Agreement::SENT_TO_AGENCY], true)) {
                    $query->where('status', $status);
                }
                if ($local !== '' && $local !== 'all') {
                    $query->where('local_agency_id', $local);
                }
            }
        }

        return ApiResponse::ok($query->orderByDesc('updated_at')->get()->map->toPublic()->values());
    }

    /**
     * GET /agreements/recipients - for the admin side: the foreign companies
     * that have sent agreements, and the local agencies they can go to.
     */
    public function recipients(Request $request)
    {
        $this->requireAdminSide($request);

        $sent = Agreement::whereNotNull('agency_id')->where('status', '!=', Agreement::DRAFT)
            ->selectRaw('agency_id, COUNT(*) as total')
            ->selectRaw('SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as waiting', [Agreement::SENT_TO_ADMIN])
            ->groupBy('agency_id')->get()->keyBy('agency_id');

        $companies = Agency::where('type', 'foreign')->orderBy('name')->get()
            ->map(fn (Agency $a) => [
                'id' => $a->id,
                'name' => $a->name,
                'code' => $a->code,
                'agreements' => (int) ($sent[$a->id]->total ?? 0),
                'waiting' => (int) ($sent[$a->id]->waiting ?? 0),
            ])->values();

        $localAgencies = Agency::where(fn ($q) => $q->where('type', 'local')->orWhereNull('type'))
            ->where('status', 'active')->orderBy('name')->get()
            ->map(fn (Agency $a) => ['id' => $a->id, 'name' => $a->name, 'code' => $a->code])->values();

        return ApiResponse::ok(['companies' => $companies, 'localAgencies' => $localAgencies]);
    }

    /**
     * POST /agreements - a copy of a template. A company's copy belongs to
     * that company and starts with the employer part filled from its record.
     */
    public function store(Request $request)
    {
        $company = $this->writer($request);

        $request->validate([
            'templateId' => ['required', 'integer'],
            'title' => ['required', 'string', 'min:3', 'max:150'],
        ], ['title.required' => 'Give the agreement a title, such as the employee\'s name.']);

        $template = $this->findTemplate((string) $request->input('templateId'), $company);
        $agreement = $this->createAgreement($template, trim($request->input('title')), $this->actor($request));

        return ApiResponse::created($agreement->load('template', 'agency')->toPublic(true), 'Agreement created.');
    }

    /** GET /agreements/{id} - the values, and the layout to lay them out with. */
    public function show(Request $request, string $id)
    {
        return ApiResponse::ok($this->findAgreement($request, $id)->toPublic(true));
    }

    /** GET /agreements/{id}/file - the PDF behind an agreement, for whoever may read it. */
    public function file(Request $request, string $id)
    {
        return $this->pdf($this->findAgreement($request, $id)->template);
    }

    /**
     * PUT /agreements/{id}  { title?, values: { field: { en, he, si, auto } } }
     *
     * Only the fields the layout lists are kept, so a stray key never reaches
     * the paper. A company's agreement keeps its English to the company
     * record; only its Hebrew and Sinhala are taken from what is sent.
     */
    public function update(Request $request, string $id)
    {
        if ($this->viewer($request)[0] === 'local') {
            return $this->updateEmployee($request, $this->findAgreement($request, $id));
        }

        $company = $this->writer($request);
        $agreement = $this->findAgreement($request, $id);
        $this->requireEditable($agreement, $company);

        $request->validate([
            'title' => ['sometimes', 'string', 'min:3', 'max:150'],
            'values' => ['sometimes', 'array'],
            'values.*.en' => ['nullable', 'string', 'max:'.self::MAX_VALUE],
            'values.*.he' => ['nullable', 'string', 'max:'.self::MAX_VALUE],
            'values.*.si' => ['nullable', 'string', 'max:'.self::MAX_VALUE],
            'values.*.auto' => ['nullable', 'array'],
        ], [
            'values.*.*.max' => 'A value may not be longer than '.self::MAX_VALUE.' characters.',
        ]);

        if ($request->has('values') && $company) {
            // The employee part, once a local agency fills it, is not the company's.
            $agreement->field_values = array_merge(
                (array) $agreement->field_values,
                EmployerDetails::edited($company, (array) $request->input('values'))
            );
        } elseif ($request->has('values')) {
            $known = array_flip(AgreementLayout::keys($agreement->template->layout));
            $clean = [];

            foreach ((array) $request->input('values') as $key => $value) {
                if (! isset($known[$key])) {
                    continue;
                }

                $clean[$key] = [
                    'en' => trim((string) ($value['en'] ?? '')),
                    'he' => trim((string) ($value['he'] ?? '')),
                    'si' => trim((string) ($value['si'] ?? '')),
                    'auto' => [
                        'he' => (bool) ($value['auto']['he'] ?? false),
                        'si' => (bool) ($value['auto']['si'] ?? false),
                    ],
                ];
            }

            $agreement->field_values = $clean;
        }

        if ($request->has('title')) {
            $agreement->title = trim($request->input('title'));
        }

        $agreement->updated_by = $this->actor($request);
        $agreement->save();

        return ApiResponse::ok($agreement->fresh(['template', 'agency', 'localAgency'])->toPublic(true), 'Agreement saved.');
    }

    /**
     * PATCH /agreements/{id}/details  { title?, salary? }  (also PUT .../salary)
     *
     * What the company keeps up to date on its agreement at any stage, even
     * once sent: its name, and the monthly salary in NIS. The salary is kept
     * as the figure and as clause 3a writes it in each language - the figure
     * and the amount in words - in place of the amount the paper prints. The
     * PDF is built from what is saved, so every side sees the change.
     */
    public function details(Request $request, string $id)
    {
        $company = $this->writer($request);
        $agreement = $this->findAgreement($request, $id);

        if (! $company || $agreement->agency_id !== $company->id) {
            throw new ApiException(403, 'The company that filled the agreement edits it.');
        }

        $request->validate([
            'title' => ['sometimes', 'string', 'min:3', 'max:150'],
            'salary' => ['sometimes', 'required', 'numeric', 'min:1', 'max:999999.99'],
        ], [
            'title.min' => 'Name the agreement with at least 3 characters.',
            'salary.required' => 'Enter the monthly salary in NIS.',
            'salary.numeric' => 'Enter the salary as a number, such as 6247.67.',
            'salary.min' => 'Enter the monthly salary in NIS.',
            'salary.max' => 'The salary may not be more than 999,999.99 NIS.',
        ]);

        if (! $request->hasAny(['title', 'salary'])) {
            throw new ApiException(422, 'Nothing to change: send a name or a salary.');
        }

        if ($request->has('title')) {
            $agreement->title = trim($request->input('title'));
        }

        if ($request->has('salary')) {
            $salary = round((float) $request->input('salary'), 2);
            $values = (array) $agreement->field_values;
            $values['salary'] = SalaryWords::phrases($salary) + ['auto' => ['he' => false, 'si' => false]];
            $agreement->salary_nis = $salary;
            $agreement->field_values = $values;
        }

        $agreement->updated_by = $this->actor($request);
        $agreement->save();

        return ApiResponse::ok(
            $agreement->fresh(['template', 'agency', 'localAgency', 'candidate'])->toPublic(true),
            'Agreement saved.'
        );
    }

    /** The pictures a company puts on its agreement. */
    private const MARKS = ['seal', 'signature'];

    /**
     * POST /agreements/{id}/marks  (type: seal|signature, file)
     *
     * The company seal or the signature, at any stage - like the salary, the
     * company keeps them up to date. A new one replaces the old. Both are
     * printed at the foot of every page.
     */
    public function uploadMark(Request $request, string $id)
    {
        $company = $this->writer($request);
        $agreement = $this->findAgreement($request, $id);

        if (! $company || $agreement->agency_id !== $company->id) {
            throw new ApiException(403, 'The company that filled the agreement adds its seal and signature.');
        }

        $request->validate([
            'type' => ['required', Rule::in(self::MARKS)],
            'file' => ['required', 'file', 'max:'.config('documents.max_kb'), 'mimes:jpg,jpeg,png,webp'],
        ], [
            'type.in' => 'Choose the seal or the signature.',
            'file.mimes' => 'The seal and the signature are pictures: JPG, PNG or WEBP.',
            'file.max' => 'The picture may not be larger than '.round(config('documents.max_kb') / 1024).' MB.',
        ]);

        $type = $request->input('type');
        $file = $request->file('file');
        $disk = config('documents.disk');
        $path = $file->storeAs(
            'agreements/'.$agreement->id.'/'.$type,
            Str::uuid().'.'.strtolower($file->getClientOriginalExtension()),
            ['disk' => $disk]
        );

        // The local disk is configured with 'throw' => false, so a failed
        // write comes back as false rather than as an exception.
        if (! is_string($path) || ! Storage::disk($disk)->exists($path)) {
            throw new ApiException(500, 'The picture could not be saved on the server. Make sure storage/ is writable (permissions 755).');
        }

        $previous = $agreement->{$type.'_path'};
        if ($previous && $previous !== $path) {
            Storage::disk($disk)->delete($previous);
        }

        $agreement->update([$type.'_path' => $path, 'updated_by' => $this->actor($request)]);

        return ApiResponse::ok(
            $agreement->fresh(['template', 'agency', 'localAgency', 'candidate'])->toPublic(true),
            ($type === 'seal' ? 'Seal' : 'Signature').' saved.'
        );
    }

    /** GET /agreements/{id}/marks/{type} - the picture, for whoever may read the agreement. */
    public function mark(Request $request, string $id, string $type)
    {
        $agreement = $this->findAgreement($request, $id);
        $path = in_array($type, self::MARKS, true) ? $agreement->{$type.'_path'} : null;
        $disk = config('documents.disk');

        if (! $path || ! Storage::disk($disk)->exists($path)) {
            throw new ApiException(404, 'No '.$type.' has been added to this agreement.');
        }

        return $this->storage($disk)->response($path);
    }

    /**
     * A local agency's save: the employee part alone, with its English kept
     * to the candidate's file. The employer part is left as the company sent it.
     */
    private function updateEmployee(Request $request, Agreement $agreement)
    {
        $candidate = $agreement->candidate;
        if (! $candidate) {
            throw new ApiException(409, 'Assign a candidate to the agreement first.');
        }

        $request->validate([
            'values' => ['required', 'array'],
            'values.*.he' => ['nullable', 'string', 'max:'.self::MAX_VALUE],
            'values.*.si' => ['nullable', 'string', 'max:'.self::MAX_VALUE],
            'values.*.auto' => ['nullable', 'array'],
        ]);

        $agreement->field_values = array_merge(
            (array) $agreement->field_values,
            CandidateDetails::fromRequest($candidate, (array) $request->input('values'))
        );
        $agreement->updated_by = $this->actor($request);
        $agreement->save();

        return ApiResponse::ok($agreement->fresh(['template', 'agency', 'localAgency', 'candidate'])->toPublic(true), 'Agreement saved.');
    }

    /** The agreement a local agency was sent - only it assigns candidates to it. */
    private function localAgreement(Request $request, string $id): array
    {
        [$side, $agency] = $this->viewer($request);
        if ($side !== 'local') {
            throw new ApiException(403, 'The local agency the agreement was sent to assigns its candidate.');
        }

        return [$this->findAgreement($request, $id), $agency];
    }

    /**
     * GET /agreements/{id}/candidates - the local agency's candidates to
     * choose from: those who passed first, in the order they passed, then
     * the rest. Each says whether another agreement already has them.
     */
    public function candidates(Request $request, string $id)
    {
        [$agreement, $agency] = $this->localAgreement($request, $id);

        $taken = Agreement::whereNotNull('candidate_id')->where('id', '!=', $agreement->id)
            ->get(['id', 'title', 'candidate_id'])->keyBy('candidate_id');

        $candidates = Candidate::with('jobRole')->where('agency_id', $agency->id)
            ->orderByRaw('CASE WHEN passed_at IS NULL THEN 1 ELSE 0 END')
            ->orderBy('passed_at')
            ->orderBy('name')
            ->get()
            ->map(fn (Candidate $c) => [
                'id' => $c->id,
                'name' => $c->name,
                'nicNo' => $c->nic_no,
                'passportNo' => $c->passport_no,
                'dateOfBirth' => $c->date_of_birth?->toDateString(),
                'jobRole' => $c->jobRole?->name,
                'passed' => $c->passed_at !== null,
                'passedAt' => $c->passed_at,
                'assignedTo' => isset($taken[$c->id])
                    ? ['id' => $taken[$c->id]->id, 'title' => $taken[$c->id]->title]
                    : null,
            ])->values();

        return ApiResponse::ok($candidates);
    }

    /**
     * POST /agreements/{id}/assign  { candidateId }
     *
     * Puts one of the agency's candidates on the agreement and fills the
     * employee part from their file, in all three languages. Assigning
     * another candidate replaces the first.
     */
    public function assign(Request $request, string $id)
    {
        [$agreement, $agency] = $this->localAgreement($request, $id);

        $request->validate(['candidateId' => ['required', 'integer']], ['candidateId.required' => 'Choose a candidate.']);

        $candidate = Candidate::where('agency_id', $agency->id)->find($request->input('candidateId'))
            ?? throw new ApiException(404, 'Candidate not found.');

        $other = Agreement::where('candidate_id', $candidate->id)->where('id', '!=', $agreement->id)->first();
        if ($other) {
            throw new ApiException(409, $candidate->name.' is already assigned to '.$other->title.'.');
        }

        [$employee] = CandidateDetails::fill($candidate);
        $values = array_diff_key((array) $agreement->field_values, CandidateDetails::KINDS);

        $agreement->update([
            'candidate_id' => $candidate->id,
            'candidate_assigned_at' => now(),
            'field_values' => array_merge($values, array_filter($employee, fn ($value) => $value['en'] !== '')),
            'updated_by' => $this->actor($request),
        ]);

        return ApiResponse::ok(
            $agreement->fresh(['template', 'agency', 'localAgency', 'candidate'])->toPublic(true),
            $candidate->name.' assigned to the agreement.'
        );
    }

    /**
     * POST /agreements/{id}/send-to-admin - a company hands its checked
     * agreement over. From here on the company only reads it.
     */
    public function sendToAdmin(Request $request, string $id)
    {
        $company = $this->writer($request);
        $agreement = $this->findAgreement($request, $id);

        if (! $company || $agreement->agency_id !== $company->id) {
            throw new ApiException(403, 'Only the company that filled the agreement sends it to the admin.');
        }
        if ($agreement->status !== Agreement::DRAFT) {
            throw new ApiException(409, 'This agreement has already been sent to the admin.');
        }

        $missing = EmployerDetails::missing(EmployerDetails::english($company));
        if ($missing) {
            throw new ApiException(422, 'Complete the company details first - missing: '.implode(', ', $missing).'.');
        }

        $agreement->update([
            'status' => Agreement::SENT_TO_ADMIN,
            'sent_to_admin_at' => now(),
            'updated_by' => $this->actor($request),
        ]);

        return ApiResponse::ok($agreement->fresh(['template', 'agency', 'localAgency'])->toPublic(true), 'Agreement sent to the admin.');
    }

    /**
     * POST /agreements/{id}/send-to-agency  { agencyId }
     *
     * The admin side passes a company's agreement to one local agency - the
     * first time that agency sees it. Sending again moves it to another.
     */
    public function sendToAgency(Request $request, string $id)
    {
        $this->requireAdminSide($request);
        $agreement = $this->findAgreement($request, $id);

        if (! $agreement->agency_id || $agreement->status === Agreement::DRAFT) {
            throw new ApiException(409, 'Only an agreement a foreign company has sent to the admin can go to a local agency.');
        }

        $request->validate(['agencyId' => ['required', 'string']], ['agencyId.required' => 'Choose the local agency.']);

        $target = Agency::find($request->input('agencyId'));
        if (! $target || ($target->type ?? 'local') !== 'local') {
            throw new ApiException(422, 'Choose a local agency.');
        }

        $agreement->update([
            'status' => Agreement::SENT_TO_AGENCY,
            'local_agency_id' => $target->id,
            'sent_to_agency_at' => now(),
            'sent_to_agency_by' => $this->actor($request),
        ]);

        return ApiResponse::ok(
            $agreement->fresh(['template', 'agency', 'localAgency'])->toPublic(true),
            'Agreement sent to '.$target->name.'.'
        );
    }

    /** DELETE /agreements/{id} - a company deletes its own, sent or not. */
    public function destroy(Request $request, string $id)
    {
        // A company deletes its own at any stage, even once sent: it is gone
        // for the admin side and the local agency too. findAgreement only
        // finds a company's own.
        $company = $this->writer($request);
        $agreement = $this->findAgreement($request, $id);

        $template = $agreement->template;
        foreach (self::MARKS as $type) {
            if ($agreement->{$type.'_path'}) {
                Storage::disk(config('documents.disk'))->delete($agreement->{$type.'_path'});
            }
        }
        $agreement->delete();

        // A company's PDF was uploaded for this one agreement; it goes with it.
        // A saved one stays, for the next agreement.
        if ($company && $template && ! $template->saved && $template->agreements()->count() === 0) {
            Storage::disk($template->disk)->delete($template->path);
            $template->delete();
        }

        return ApiResponse::ok(['id' => (int) $id], $agreement->title.' deleted.');
    }

    /**
     * POST /agreements/employer-localise  { english: { field: text } }
     *
     * The Hebrew and Sinhala of employer fields from English the company has
     * just typed, each the way the field is carried over: numbers copied,
     * names spelt by sound, the address and position translated where a key
     * is set. Nothing is saved.
     */
    public function localiseEmployer(Request $request)
    {
        $this->writer($request);

        $request->validate([
            'english' => ['required', 'array', 'min:1'],
            'english.*' => ['nullable', 'string', 'max:'.self::MAX_VALUE],
        ]);

        $section = EmployerDetails::section();
        $sent = (array) $request->input('english');
        $section['fields'] = array_values(array_filter(
            $section['fields'],
            fn ($field) => array_key_exists($field['key'], $sent)
        ));
        $english = array_map(fn ($text) => trim((string) $text), $sent);

        [$values, $error] = EmployerDetails::localise($section, $english, [EmployerDetails::class, 'spelt']);

        return ApiResponse::ok(['values' => (object) $values, 'translationError' => $error]);
    }

    /**
     * POST /agreements/translate  { texts: [english, ...] }
     *
     * Hebrew and Sinhala for each text, in the same order. Empty texts are
     * answered empty without being sent anywhere.
     */
    public function translate(Request $request)
    {
        $this->writer($request);

        $request->validate([
            'texts' => ['required', 'array', 'min:1', 'max:50'],
            'texts.*' => ['nullable', 'string', 'max:'.self::MAX_VALUE],
        ]);

        $texts = array_map(fn ($t) => trim((string) $t), $request->input('texts'));
        $filled = array_filter($texts, fn ($t) => $t !== '');

        $result = ['he' => array_fill(0, count($texts), ''), 'si' => array_fill(0, count($texts), '')];

        if ($filled) {
            $translated = TranslationService::fromEnglish(array_values($filled));
            $positions = array_keys($filled);

            foreach (array_keys($result) as $lang) {
                foreach ($positions as $i => $position) {
                    $result[$lang][$position] = $translated[$lang][$i] ?? '';
                }
            }
        }

        return ApiResponse::ok($result);
    }
}
