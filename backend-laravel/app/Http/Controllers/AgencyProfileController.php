<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Models\Agency;
use App\Models\OtpChallenge;
use App\Models\User;
use App\Services\EmailService;
use App\Services\OtpService;
use App\Services\SmsService;
use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

/**
 * An agency editing its own details.
 *
 * Name, contact person and address save straight away. The phone and email
 * are where sign-in codes go, so a new one is written only once the code sent
 * to it has been entered - a typo would otherwise lock the agency out.
 */
class AgencyProfileController extends Controller
{
    /** Marks a challenge as a contact change, so it is never a sign-in step. */
    private const PURPOSE = 'contact_change';

    /** The signed-in owner and the agency it runs. */
    private function owner(Request $request): array
    {
        $auth = $request->attributes->get('auth_user');
        $user = User::find($auth['sub'] ?? null);

        // The phone and email here are the owner's own sign-in, so staff
        // logins inside the agency do not get to change them.
        if (! $user || $user->role_slug !== 'agency_owner') {
            throw new ApiException(403, 'Only the agency owner can edit the agency details.');
        }

        $agency = $user->agency_id ? Agency::find($user->agency_id) : null;
        if (! $agency) {
            throw new ApiException(403, 'Your account is not linked to an agency.');
        }

        return [$user, $agency];
    }

    /** The agency as the page shows it, with the owner's sign-in phone and email. */
    private function payload(User $owner, Agency $agency): array
    {
        return array_merge($agency->toPublic(), [
            // Sign-in codes go to the owner login, so these are what count -
            // not the copy kept on the agency row.
            'email' => $owner->email,
            'phone' => $owner->phone,
        ]);
    }

    /** Whether another login already signs in with this phone or email. */
    private function takenByAnother(string $field, string $value, User $owner): bool
    {
        $query = User::where('id', '!=', $owner->id);

        if ($field === 'email') {
            return $query->where('email', $value)->exists();
        }

        // Compared as digits, the same way sign-in matches a phone.
        return $query
            ->whereRaw("REPLACE(REPLACE(phone, ' ', ''), '+', '') = ?", [preg_replace('/\D/', '', $value)])
            ->exists();
    }

    /** A contact change this owner opened - never a sign-in challenge, never another login's. */
    private function ownChallenge(?string $id, User $owner): OtpChallenge
    {
        $challenge = $id ? OtpService::getChallenge($id) : null;

        if (! $challenge
            || (int) $challenge->admin_id !== (int) $owner->id
            || ($challenge->meta['purpose'] ?? null) !== self::PURPOSE) {
            throw new ApiException(400, 'This verification session has expired. Request a new code.');
        }

        return $challenge;
    }

    private function sendCode(string $field, string $to, string $code): array
    {
        return $field === 'phone'
            ? SmsService::sendOtp($to, $code)
            : EmailService::sendOtp($to, $code, 'confirm this as the new email address for your agency');
    }

    /** GET /agency-profile */
    public function show(Request $request)
    {
        [$owner, $agency] = $this->owner($request);

        return ApiResponse::ok($this->payload($owner, $agency));
    }

    /** PUT /agency-profile - the details that need no code. */
    public function update(Request $request)
    {
        [$owner, $agency] = $this->owner($request);

        $data = Validator::make($request->all(), [
            'name' => 'required|string|min:3|max:150',
            'contact' => 'required|string|min:3|max:120',
            'address' => 'required|string|min:8|max:255',
        ], [
            'name.required' => 'Agency name is required.',
            'name.min' => 'Name must be at least 3 characters.',
            'contact.required' => 'A contact person is required.',
            'contact.min' => 'Contact name must be at least 3 characters.',
            'address.required' => 'Address is required.',
            'address.min' => 'Please provide the full address.',
        ])->validate();

        DB::transaction(function () use ($owner, $agency, $data) {
            $agency->name = trim($data['name']);
            $agency->contact = trim($data['contact']);
            $agency->address = trim($data['address']);
            $agency->save();

            // Copied onto every login when the agency was created, so a rename
            // has to reach them too.
            User::where('agency_id', $agency->id)->update(['agency_name' => $agency->name]);

            // The owner login is created under the contact person's name.
            $owner->name = $agency->contact;
            $owner->save();
        });

        return ApiResponse::ok($this->payload($owner, $agency), 'Agency details saved.');
    }

    /** POST /agency-profile/contact - sends a code to the new phone or email. */
    public function requestContactChange(Request $request)
    {
        [$owner] = $this->owner($request);

        $field = $request->input('field');
        if (! in_array($field, ['phone', 'email'], true)) {
            throw new ApiException(422, 'Choose the phone number or the email to change.');
        }

        $noun = $field === 'phone' ? 'phone number' : 'email address';

        Validator::make(['value' => $request->input('value')], [
            'value' => $field === 'phone'
                ? ['required', 'string', 'regex:/^[0-9+\s-]{9,20}$/']
                : ['required', 'email', 'max:190'],
        ], [
            'value.required' => 'Enter the new '.$noun.'.',
            'value.regex' => 'Enter a valid phone number.',
            'value.email' => 'Enter a valid email address.',
        ])->validate();

        $value = trim((string) $request->input('value'));
        if ($field === 'email') {
            $value = strtolower($value);
        }

        $current = $field === 'phone'
            ? preg_replace('/\D/', '', (string) $owner->phone) === preg_replace('/\D/', '', $value)
            : strtolower((string) $owner->email) === $value;
        if ($current) {
            throw new ApiException(422, 'That is already the '.$noun.' on this account.', ['value' => 'Enter a different '.$noun.'.']);
        }

        if ($this->takenByAnother($field, $value, $owner)) {
            throw new ApiException(409, 'That '.$noun.' is already in use.', ['value' => 'That '.$noun.' is already in use.']);
        }

        $challenge = OtpService::createChallenge(
            $owner->id,
            $value,
            $field === 'phone' ? 'sms' : 'email',
            ['purpose' => self::PURPOSE, 'field' => $field]
        );
        $sent = $this->sendCode($field, $value, $challenge['code']);

        return ApiResponse::ok([
            'challengeId' => $challenge['id'],
            'field' => $field,
            'destination' => $value,
            'resendCooldown' => OtpService::resendCooldown(),
            'devCode' => OtpService::devCode($challenge['code'], $sent),
        ], 'A code has been sent to '.$value.'.');
    }

    /** POST /agency-profile/contact/resend */
    public function resendContactCode(Request $request)
    {
        [$owner] = $this->owner($request);
        $challenge = $this->ownChallenge($request->input('challengeId'), $owner);

        $result = OtpService::rotateCode($challenge->id);
        if (! $result['ok']) {
            $suffix = isset($result['retryAfter']) ? ' ('.$result['retryAfter'].'s)' : '';
            throw new ApiException(429, $result['reason'].$suffix);
        }

        $sent = $this->sendCode($challenge->meta['field'], $challenge->destination, $result['code']);

        return ApiResponse::ok([
            'cooldown' => $result['cooldown'],
            'devCode' => OtpService::devCode($result['code'], $sent),
        ], 'A new code has been sent.');
    }

    /** POST /agency-profile/contact/verify - the code came back, so the change is saved. */
    public function verifyContactChange(Request $request)
    {
        [$owner, $agency] = $this->owner($request);

        Validator::make($request->all(), [
            'challengeId' => 'required|string',
            'code' => 'required|string|size:6',
        ], [
            'challengeId.required' => 'Challenge id is required.',
            'code.size' => 'Enter the 6-digit code.',
        ])->validate();

        // Checked before the code is tried, so nobody else can spend this
        // challenge's attempts.
        $challenge = $this->ownChallenge($request->input('challengeId'), $owner);

        $result = OtpService::verifyChallenge($challenge->id, (string) $request->input('code'));
        if (! $result['ok']) {
            throw new ApiException(400, $result['reason']);
        }

        $field = $result['challenge']->meta['field'];
        $value = $result['challenge']->destination;

        // Somebody else may have claimed it while the code was open.
        if ($this->takenByAnother($field, $value, $owner)) {
            throw new ApiException(409, 'That '.($field === 'phone' ? 'phone number' : 'email address').' is already in use.');
        }

        DB::transaction(function () use ($owner, $agency, $field, $value) {
            $now = now()->format('Y-m-d H:i:s');

            if ($field === 'phone') {
                $owner->phone = $value;
                $owner->phone_verified_at = $now;
            } else {
                $owner->email = $value;
                $owner->email_verified_at = $now;

                // The agency row keeps its own copy, which the admin's list shows.
                $agency->email = $value;
                $agency->save();
            }

            $owner->save();
        });

        return ApiResponse::ok(
            $this->payload($owner, $agency),
            $field === 'phone' ? 'Phone number updated.' : 'Email address updated.'
        );
    }
}
