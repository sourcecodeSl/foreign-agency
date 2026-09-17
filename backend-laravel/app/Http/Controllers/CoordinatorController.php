<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Models\Agency;
use App\Models\User;
use App\Support\ApiResponse;
use App\Support\Credentials;
use App\Support\PageAccess;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

/**
 * Coordinators: people the Main Admin adds to help run the system, each opened
 * to exactly the pages they need.
 *
 * Main Admin only. A coordinator signs in like anyone else - confirming the
 * phone and email once, on the first sign-in - and every request is checked
 * against the pages ticked here, so a page taken away closes at once.
 */
class CoordinatorController extends Controller
{
    private const MESSAGES = [
        'name.required' => 'Full name is required.',
        'name.min' => 'Name must be at least 3 characters.',
        'email.required' => 'An email address is required for sign-in codes.',
        'email.email' => 'Enter a valid email address.',
        'phone.required' => 'A phone number is required for sign-in codes.',
        'phone.regex' => 'Enter a valid phone number.',
        'username.required' => 'Username is required.',
        'username.regex' => 'Username must be 4-20 characters (letters, numbers, . _ -).',
        'password.min' => 'Password must be at least 8 characters.',
        'password.regex' => 'Password must include an uppercase letter and a number.',
        'status.in' => 'Unknown status.',
    ];

    private function requireMainAdmin(Request $request): void
    {
        $auth = $request->attributes->get('auth_user');

        if (($auth['roleSlug'] ?? null) !== 'main_admin') {
            throw new ApiException(403, 'Only the Main Admin can manage coordinators.');
        }
    }

    private function iso($value): ?string
    {
        return $value ? Carbon::parse($value)->toIso8601String() : null;
    }

    private function find(string $id): User
    {
        $user = User::where('id', $id)->where('role_slug', PageAccess::ROLE)->first();
        if (! $user) {
            throw new ApiException(404, 'Coordinator not found.');
        }

        return $user;
    }

    private function payload(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'username' => $user->username,
            'email' => $user->email,
            'phone' => $user->phone,
            'status' => $user->status,
            'pages' => $user->pageAccess(),
            'phoneVerifiedAt' => $this->iso($user->phone_verified_at),
            'emailVerifiedAt' => $this->iso($user->email_verified_at),
            'lastLogin' => $this->iso($user->last_login_at),
            'createdAt' => $this->iso($user->created_at),
        ];
    }

    private function rules(bool $creating): array
    {
        $required = $creating ? 'required' : 'sometimes';

        $rules = [
            'name' => [$required, 'string', 'min:3', 'max:120'],
            'email' => [$required, 'email', 'max:190'],
            'phone' => [$required, 'string', 'regex:/^[0-9+\s-]{9,20}$/'],
        ];

        if ($creating) {
            $rules['username'] = ['required', 'regex:/^[a-zA-Z0-9._-]{4,20}$/'];
            $rules['password'] = ['nullable', 'string', 'min:8', 'regex:/[A-Z]/', 'regex:/[0-9]/'];
        }

        return $rules;
    }

    /**
     * The pages in the request. An unknown key means the screen is out of date,
     * so it is refused rather than quietly dropped.
     */
    private function requestedPages(Request $request): array
    {
        $pages = $request->input('pages', []);

        if (! is_array($pages) || count(array_filter($pages, 'is_string')) !== count($pages)) {
            $message = 'Choose the pages as a list.';
            throw new ApiException(422, $message, ['pages' => $message]);
        }

        $unknown = array_values(array_diff($pages, PageAccess::keys()));
        if ($unknown !== []) {
            $message = 'Unknown page: '.implode(', ', $unknown).'. Reload the screen and try again.';
            throw new ApiException(422, $message, ['pages' => $message]);
        }

        return PageAccess::clean($pages);
    }

    /** A username, email or phone belongs to one login only. */
    private function refuseTaken(array $values, ?User $except = null): void
    {
        $others = fn () => User::query()->when($except, fn ($q) => $q->where('id', '!=', $except->id));
        $conflicts = [];

        if (isset($values['username'])
            && ($others()->where('username', $values['username'])->exists()
                || Agency::where('username', $values['username'])->exists())) {
            $conflicts['username'] = 'That username is already taken.';
        }

        if (isset($values['email'])
            && $others()->where('email', strtolower(trim($values['email'])))->exists()) {
            $conflicts['email'] = 'That email is already in use.';
        }

        if (isset($values['phone'])) {
            $digits = preg_replace('/\D/', '', $values['phone']);

            // Single quotes: SQLite reads double quotes as identifiers.
            if ($others()->whereRaw("REPLACE(REPLACE(phone, ' ', ''), '+', '') = ?", [$digits])->exists()) {
                $conflicts['phone'] = 'That phone number is already in use.';
            }
        }

        if ($conflicts) {
            throw new ApiException(409, 'These details are already in use.', $conflicts);
        }
    }

    /** GET /coordinators - everyone added, and the pages that can be opened. */
    public function index(Request $request)
    {
        $this->requireMainAdmin($request);

        $coordinators = User::where('role_slug', PageAccess::ROLE)
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get()
            ->map(fn (User $user) => $this->payload($user))
            ->values();

        return ApiResponse::ok([
            'coordinators' => $coordinators,
            'pages' => PageAccess::catalogue(),
        ]);
    }

    /** POST /coordinators - the password is shown once, in this answer. */
    public function store(Request $request)
    {
        $this->requireMainAdmin($request);

        Validator::make($request->all(), $this->rules(true), self::MESSAGES)->validate();
        $pages = $this->requestedPages($request);
        $this->refuseTaken($request->only('username', 'email', 'phone'));

        $password = (string) $request->input('password', '');
        if ($password === '') {
            $password = Credentials::generatePassword();
        }

        $user = User::create([
            'name' => trim($request->input('name')),
            'username' => $request->input('username'),
            'email' => strtolower(trim($request->input('email'))),
            'phone' => trim($request->input('phone')),
            'password_hash' => password_hash($password, PASSWORD_BCRYPT),
            'role_slug' => PageAccess::ROLE,
            // Active at once: the first sign-in confirms the phone and email.
            'status' => 'active',
            'page_access' => $pages,
        ]);

        return ApiResponse::created(
            $this->payload($user) + ['credentials' => ['username' => $user->username, 'password' => $password]],
            $user->name.' can now sign in.'
        );
    }

    /** PUT /coordinators/:id - details and pages; the username stays as issued. */
    public function update(Request $request, string $id)
    {
        $this->requireMainAdmin($request);
        $user = $this->find($id);

        Validator::make($request->all(), $this->rules(false), self::MESSAGES)->validate();
        $pages = $request->has('pages') ? $this->requestedPages($request) : null;
        $this->refuseTaken($request->only('email', 'phone'), $user);

        if ($request->has('name')) {
            $user->name = trim($request->input('name'));
        }
        // A changed email or phone is confirmed again on the next sign-in.
        if ($request->has('email')) {
            $user->assignEmail((string) $request->input('email'));
        }
        if ($request->has('phone')) {
            $user->assignPhone(trim((string) $request->input('phone')));
        }
        if ($pages !== null) {
            $user->page_access = $pages;
        }
        $user->save();

        return ApiResponse::ok($this->payload($user), $user->name.' has been updated.');
    }

    /** PATCH /coordinators/:id/status - deactivating ends their session at once. */
    public function updateStatus(Request $request, string $id)
    {
        $this->requireMainAdmin($request);

        Validator::make($request->all(), [
            'status' => 'required|in:active,deactivated',
        ], self::MESSAGES)->validate();

        $user = $this->find($id);
        $user->status = $request->input('status');
        $user->save();

        return ApiResponse::ok(
            $this->payload($user),
            $user->name.($user->status === 'active' ? ' can sign in again.' : ' can no longer sign in.')
        );
    }

    /** POST /coordinators/:id/password - a fresh password, shown once. */
    public function resetPassword(Request $request, string $id)
    {
        $this->requireMainAdmin($request);
        $user = $this->find($id);

        $password = Credentials::generatePassword();
        $user->password_hash = password_hash($password, PASSWORD_BCRYPT);
        $user->save();

        return ApiResponse::ok(
            ['username' => $user->username, 'password' => $password],
            'New password generated for '.$user->name.'.'
        );
    }

    /** DELETE /coordinators/:id - a coordinator owns no records, so nothing is left behind. */
    public function destroy(Request $request, string $id)
    {
        $this->requireMainAdmin($request);
        $user = $this->find($id);

        $name = $user->name;
        $user->delete();

        return ApiResponse::ok(['id' => (int) $id], $name.' has been removed.');
    }
}
