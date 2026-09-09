<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Candidate registration. Passport and NIC must be unique inside the agency
 * that owns the record, which is why the rules are scoped rather than global.
 */
class StoreCandidateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        $agencyId = $this->agencyId();
        $candidateId = $this->route('candidate')?->id;

        $scoped = fn (string $column) => Rule::unique('candidates', $column)
            ->where(fn ($q) => $q->where('agency_id', $agencyId)->whereNull('deleted_at'))
            ->ignore($candidateId);

        $required = $this->isMethod('POST') ? 'required' : 'sometimes';

        return [
            'name' => [$required, 'string', 'min:3', 'max:150'],
            'passport_no' => [$required, 'string', 'max:30', 'regex:/^[A-Za-z0-9]+$/', $scoped('passport_no')],
            'nic_no' => [$required, 'string', 'max:20', 'regex:/^([0-9]{9}[VvXx]|[0-9]{12})$/', $scoped('nic_no')],
            'address' => [$required, 'string', 'min:5'],
            'mobile' => [$required, 'string', 'regex:/^[0-9+\s-]{9,20}$/'],
            'email' => ['nullable', 'email', 'max:190'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }

    public function messages(): array
    {
        return [
            'passport_no.regex' => 'Passport number may contain letters and numbers only.',
            'nic_no.regex' => 'Enter a valid NIC (9 digits plus V/X, or 12 digits).',
            'passport_no.unique' => 'A candidate with this passport number already exists.',
            'nic_no.unique' => 'A candidate with this NIC already exists.',
            'mobile.regex' => 'Enter a valid mobile number.',
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge(array_filter([
            'passport_no' => $this->passport_no ? strtoupper(trim($this->passport_no)) : null,
            'nic_no' => $this->nic_no ? strtoupper(trim($this->nic_no)) : null,
            'email' => $this->email ? mb_strtolower(trim($this->email)) : null,
        ], fn ($v) => $v !== null));
    }

    /** Agency users are pinned to their own agency; an admin may target one. */
    public function agencyId(): ?int
    {
        $user = $this->user();

        if ($user?->isAgency()) {
            return $user->agency_id;
        }

        return $this->route('candidate')?->agency_id ?? $this->integer('agency_id') ?: null;
    }
}
