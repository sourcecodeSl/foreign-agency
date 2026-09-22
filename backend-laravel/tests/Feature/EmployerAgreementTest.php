<?php

namespace Tests\Feature;

use App\Models\Agency;
use App\Models\EmployerAgreement;
use App\Models\User;
use App\Support\Jwt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * A foreign company submits the employer part of the agreement from its own
 * login, filled from its record; the Main Admin reads what came in.
 */
class EmployerAgreementTest extends TestCase
{
    use RefreshDatabase;

    private Agency $company;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        config(['services.google_translate.key' => null]);

        $this->company = $this->agency('AG-9101', 'foreign', [
            'name' => 'Negev Builders Ltd',
            'registration_no' => '514236789',
            'address' => '12 Herzl Street, Tel Aviv',
            'country' => 'Israel',
            'lawyer_name' => 'Ruth Levin',
            'lawyer_id_no' => '038512477',
            'lawyer_position' => 'Company Secretary',
        ]);
    }

    private function agency(string $id, string $type, array $extra = []): Agency
    {
        return Agency::create(array_merge([
            'id' => $id,
            'name' => 'Skyline Manpower',
            'code' => 'SKY-'.substr($id, 3),
            'type' => $type,
            'address' => '221B Baker Street, Colombo 03',
            'username' => strtolower($id).'.owner',
            'password_hash' => password_hash('Passw0rd1', PASSWORD_BCRYPT),
            'contact' => 'Nadia Perera',
            'email' => strtolower($id).'@example.com',
            'status' => 'active',
        ], $extra));
    }

    private function as(string $role, ?Agency $agency = null)
    {
        $this->app['auth']->forgetGuards();
        $user = $role === 'main_admin'
            ? User::where('role_slug', 'main_admin')->first()
            : User::create([
                'name' => 'Owner of '.$agency->name,
                'username' => strtolower($agency->id).'.'.$role,
                'email' => strtolower($agency->id).'.'.$role.'@example.com',
                'phone' => '07120'.random_int(10000, 99999),
                'password_hash' => password_hash('Passw0rd1', PASSWORD_BCRYPT),
                'role_slug' => $role,
                'agency_name' => $agency->name,
                'agency_id' => $agency->id,
                'status' => 'active',
            ]);

        return $this->withToken(Jwt::sign($user->toPublic()));
    }

    public function test_the_draft_is_filled_from_the_company_record_in_each_script(): void
    {
        $this->as('agency_owner', $this->company)
            ->getJson('/api/v1/employer-agreement/draft')
            ->assertOk()
            ->assertJsonPath('data.section.fields.0.label.he', 'שם תאגיד כוח-האדם')
            ->assertJsonPath('data.values.company_name.en', 'Negev Builders Ltd')
            // Names are spelt in each script, never left in English.
            ->assertJsonPath('data.values.company_name.he', 'נגו בוילדרס בע"מ')
            ->assertJsonPath('data.values.representative_name.he', 'רות לוין')
            ->assertJsonPath('data.values.representative_name.si', 'රුත් ලෙවින්')
            ->assertJsonPath('data.values.representative_name.auto.he', true)
            // Without a key, known words still come in their real translation.
            ->assertJsonPath('data.values.representative_position.he', 'מזכיר החברה')
            ->assertJsonPath('data.values.representative_position.si', 'සමාගම් ලේකම්')
            ->assertJsonPath('data.values.company_address.he', '12 הרזל רחוב, תל אביב')
            // Numbers are the same in every language.
            ->assertJsonPath('data.values.company_registration_no.si', '514236789')
            ->assertJsonPath('data.values.representative_id_no.he', '038512477')
            ->assertJsonPath('data.section.fields.3.kind', 'name')
            ->assertJsonPath('data.missing', []);
    }

    public function test_the_address_and_position_are_translated_when_a_key_is_set(): void
    {
        config(['services.google_translate.key' => 'test-key']);
        Http::fake(fn ($request) => Http::response(['data' => ['translations' => array_map(
            fn ($q) => ['translatedText' => $request->data()['target'].':'.$q],
            $request->data()['q']
        )]]));

        $this->as('agency_owner', $this->company)
            ->getJson('/api/v1/employer-agreement/draft')
            ->assertOk()
            ->assertJsonPath('data.values.company_address.he', 'he:12 Herzl Street, Tel Aviv')
            ->assertJsonPath('data.values.representative_position.si', 'si:Company Secretary')
            ->assertJsonPath('data.values.representative_position.auto.si', true)
            // Names are never sent to be translated - "Low" would come back as a word.
            ->assertJsonPath('data.values.representative_name.he', 'רות לוין');

        Http::assertSent(fn ($request) => $request->data()['q'] === ['12 Herzl Street, Tel Aviv', 'Company Secretary']);
    }

    public function test_submitting_keeps_the_record_english_and_the_corrected_translations(): void
    {
        $this->as('agency_owner', $this->company)
            ->postJson('/api/v1/employer-agreement', ['values' => [
                'company_address' => ['he' => 'רחוב הרצל 12, תל אביב', 'si' => 'හර්සල් වීදිය 12, ටෙල් අවිව්'],
                // The spelling in Hebrew is theirs to correct; the English is not.
                'company_name' => ['en' => 'Someone Else', 'he' => 'נגב בונים בע"מ'],
            ]])
            ->assertCreated()
            ->assertJsonPath('data.values.company_name.en', 'Negev Builders Ltd')
            ->assertJsonPath('data.values.company_name.he', 'נגב בונים בע"מ')
            ->assertJsonPath('data.values.company_name.si', 'නෙගෙව් බුයිල්ඩෙර්ස් සමාගම')
            ->assertJsonPath('data.values.company_address.en', '12 Herzl Street, Tel Aviv')
            ->assertJsonPath('data.values.company_address.he', 'רחוב הרצל 12, תל אביב')
            // Left empty, so it is filled for them rather than left in English.
            ->assertJsonPath('data.values.representative_position.si', 'සමාගම් ලේකම්')
            ->assertJsonPath('data.values.company_registration_no.he', '514236789');

        $this->assertSame(1, EmployerAgreement::where('agency_id', 'AG-9101')->count());
    }

    public function test_a_company_with_missing_details_is_told_what_to_fill(): void
    {
        $this->company->update(['lawyer_id_no' => null]);

        $this->as('agency_owner', $this->company)
            ->getJson('/api/v1/employer-agreement/draft')
            ->assertOk()
            ->assertJsonPath('data.missing', ['Israeli I.D. No.']);

        $this->postJson('/api/v1/employer-agreement', ['values' => []])->assertStatus(422);
    }

    public function test_only_a_foreign_company_submits(): void
    {
        $local = $this->agency('AG-9102', 'local');

        $this->as('agency_owner', $local)->getJson('/api/v1/employer-agreement/draft')->assertStatus(403);
        $this->postJson('/api/v1/employer-agreement', ['values' => []])->assertStatus(403);

        $this->as('main_admin')->postJson('/api/v1/employer-agreement', ['values' => []])->assertStatus(403);
    }

    public function test_each_company_reads_its_own_and_the_admin_reads_them_all(): void
    {
        $other = $this->agency('AG-9103', 'foreign', [
            'name' => 'Galil Works', 'registration_no' => '515000111',
            'lawyer_name' => 'Dan Cohen', 'lawyer_id_no' => '011223344', 'lawyer_position' => 'Director',
        ]);

        $this->as('agency_owner', $this->company)->postJson('/api/v1/employer-agreement')->assertCreated();
        $this->as('agency_owner', $other)->postJson('/api/v1/employer-agreement')->assertCreated();

        $this->getJson('/api/v1/employer-agreements')
            ->assertOk()
            ->assertJsonCount(1, 'data.agreements')
            ->assertJsonPath('data.agreements.0.agencyName', 'Galil Works');

        $this->as('main_admin')->getJson('/api/v1/employer-agreements')
            ->assertOk()
            ->assertJsonCount(2, 'data.agreements');
    }
}
