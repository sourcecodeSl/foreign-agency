<?php

namespace Tests\Feature;

use App\Models\Agreement;
use App\Models\User;
use App\Support\AgreementLayout;
use App\Support\Jwt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * The Main Admin uploads the agreement PDF and fills copies of it in three
 * languages; translation goes to Google, which is faked here.
 */
class AgreementTest extends TestCase
{
    use RefreshDatabase;

    private string $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        Storage::fake('local');

        $this->admin = Jwt::sign(User::where('role_slug', 'main_admin')->first()->toPublic());
        $this->withToken($this->admin);
    }

    private function upload(): array
    {
        return $this->postJson('/api/v1/agreement-templates', [
            'name' => 'SEC Construction 2025',
            'layout' => AgreementLayout::SEC_CONSTRUCTION_2025,
            'file' => UploadedFile::fake()->create('employment_agreement.pdf', 200, 'application/pdf'),
        ])->assertCreated()->json('data');
    }

    public function test_the_admin_uploads_the_pdf_and_opens_it_again(): void
    {
        $template = $this->upload();

        $this->getJson('/api/v1/agreement-templates')
            ->assertOk()
            ->assertJsonPath('data.templates.0.name', 'SEC Construction 2025')
            ->assertJsonPath('data.layouts.0.key', AgreementLayout::SEC_CONSTRUCTION_2025);

        $this->get('/api/v1/agreement-templates/'.$template['id'].'/file')
            ->assertOk()
            ->assertHeader('Content-Type', 'application/pdf');

        // Anything but a PDF is refused.
        $this->postJson('/api/v1/agreement-templates', [
            'name' => 'Not a PDF',
            'layout' => AgreementLayout::SEC_CONSTRUCTION_2025,
            'file' => UploadedFile::fake()->create('agreement.docx', 20, 'application/msword'),
        ])->assertStatus(422)->assertJsonValidationErrors(['file']);
    }

    public function test_a_copy_is_filled_in_three_languages_and_saved(): void
    {
        $template = $this->upload();

        $agreement = $this->postJson('/api/v1/agreements', [
            'templateId' => $template['id'],
            'title' => 'Kamal Perera',
        ])->assertCreated()
            // The layout comes with it, with the labels in all three languages.
            ->assertJsonPath('data.template.sections.0.fields.0.key', 'company_name')
            ->assertJsonPath('data.template.sections.0.fields.0.label.he', 'שם תאגיד כוח-האדם')
            ->json('data');

        $this->putJson('/api/v1/agreements/'.$agreement['id'], [
            'values' => [
                'passport_no' => ['en' => 'N7788990', 'he' => 'N7788990', 'si' => 'N7788990'],
                'vocation' => [
                    'en' => 'Tiler',
                    'he' => 'רַצָף',
                    'si' => 'ටයිල් කරන්නා',
                    'auto' => ['he' => true, 'si' => false],
                ],
                // Not on the paper, so not kept.
                'something_else' => ['en' => 'x'],
            ],
        ])->assertOk()
            ->assertJsonPath('data.values.passport_no.si', 'N7788990')
            ->assertJsonPath('data.values.vocation.auto.he', true)
            ->assertJsonPath('data.unchecked', 1);

        $this->assertArrayNotHasKey('something_else', Agreement::find($agreement['id'])->field_values);
    }

    public function test_english_is_translated_into_hebrew_and_sinhala(): void
    {
        config(['services.google_translate.key' => 'test-key']);

        Http::fake(function ($request) {
            $target = $request->data()['target'];
            $words = ['he' => ['Tiler' => 'רַצָף', 'Sri Lanka' => 'סרי לנקה'], 'si' => ['Tiler' => 'ටයිල් කරන්නා', 'Sri Lanka' => 'ශ්‍රී ලංකාව']];

            return Http::response(['data' => ['translations' => array_map(
                fn ($q) => ['translatedText' => $words[$target][$q]],
                $request->data()['q']
            )]]);
        });

        $this->postJson('/api/v1/agreements/translate', ['texts' => ['Tiler', '', 'Sri Lanka']])
            ->assertOk()
            ->assertJsonPath('data.he', ['רַצָף', '', 'סרי לנקה'])
            ->assertJsonPath('data.si', ['ටයිල් කරන්නා', '', 'ශ්‍රී ලංකාව']);

        // The key goes to Google, never back to the browser; empty texts are not sent.
        Http::assertSent(fn ($request) => str_contains($request->url(), 'key=test-key')
            && $request->data()['q'] === ['Tiler', 'Sri Lanka']);
    }

    public function test_without_a_key_the_screen_is_told_to_type_by_hand(): void
    {
        config(['services.google_translate.key' => null]);
        Http::fake();

        $this->postJson('/api/v1/agreements/translate', ['texts' => ['Tiler']])
            ->assertStatus(503);

        Http::assertNothingSent();
    }

    public function test_a_template_with_filled_copies_is_not_deleted(): void
    {
        $template = $this->upload();
        $agreement = $this->postJson('/api/v1/agreements', ['templateId' => $template['id'], 'title' => 'Kamal Perera'])
            ->json('data');

        $this->deleteJson('/api/v1/agreement-templates/'.$template['id'])->assertStatus(409);

        $this->deleteJson('/api/v1/agreements/'.$agreement['id'])->assertOk();
        $this->deleteJson('/api/v1/agreement-templates/'.$template['id'])->assertOk();
    }

    /** A signed-in login of a new agency of the given type. */
    private function agencyLogin(string $id, string $type): static
    {
        \App\Models\Agency::create([
            'id' => $id,
            'name' => $type === 'foreign' ? 'Negev Builders Ltd' : 'Skyline Manpower',
            'code' => 'C-'.$id,
            'type' => $type,
            'registration_no' => $type === 'foreign' ? '514236789' : null,
            'address' => '12 Herzl Street, Tel Aviv',
            'lawyer_name' => $type === 'foreign' ? 'Ruth Levin' : null,
            'lawyer_id_no' => $type === 'foreign' ? '038512477' : null,
            'lawyer_position' => $type === 'foreign' ? 'Company Secretary' : null,
            'username' => strtolower($id),
            'password_hash' => password_hash('Passw0rd1', PASSWORD_BCRYPT),
            'contact' => 'Nadia Perera',
            'email' => strtolower($id).'@example.com',
            'status' => 'active',
        ]);

        $user = User::create([
            'name' => 'Owner '.$id,
            'username' => strtolower($id).'.owner',
            'email' => strtolower($id).'.owner@example.com',
            'phone' => '07130'.random_int(10000, 99999),
            'password_hash' => password_hash('Passw0rd1', PASSWORD_BCRYPT),
            'role_slug' => 'agency_owner',
            'agency_id' => $id,
            'status' => 'active',
        ]);

        $this->app['auth']->forgetGuards();

        return $this->withToken(Jwt::sign($user->toPublic()));
    }

    private function asAdmin(): static
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken($this->admin);
    }

    public function test_a_foreign_companys_upload_is_its_agreement_filled_in_three_languages(): void
    {
        config(['services.google_translate.key' => null]);
        $this->agencyLogin('AG-9201', 'foreign');

        $template = $this->upload();
        $this->assertSame('AG-9201', $template['agencyId']);
        $this->assertNotNull($template['agreementId']);

        // Opened straight away, the employer part is already there in every script.
        $this->getJson('/api/v1/agreements/'.$template['agreementId'])
            ->assertOk()
            ->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.employerSection.fields.0.key', 'company_name')
            ->assertJsonPath('data.values.company_name.en', 'Negev Builders Ltd')
            ->assertJsonPath('data.values.company_registration_no.he', '514236789')
            ->assertJsonPath('data.values.representative_name.he', 'רות לוין')
            ->assertJsonPath('data.values.representative_position.si', 'සමාගම් ලේකම්');

        // The company changes any of it on this agreement, English and numbers too;
        // a cell left empty is filled again from the record.
        $this->putJson('/api/v1/agreements/'.$template['agreementId'], ['values' => [
            'company_address' => ['en' => '5 Jaffa Road, Jerusalem', 'he' => 'רחוב יפו 5, ירושלים'],
            'company_registration_no' => ['en' => '514236790', 'he' => '514236790', 'si' => '514236790'],
            'representative_name' => ['en' => '', 'he' => ''],
        ]])
            ->assertOk()
            ->assertJsonPath('data.values.company_address.en', '5 Jaffa Road, Jerusalem')
            ->assertJsonPath('data.values.company_address.he', 'רחוב יפו 5, ירושלים')
            ->assertJsonPath('data.values.company_registration_no.en', '514236790')
            ->assertJsonPath('data.values.representative_name.en', 'Ruth Levin')
            ->assertJsonPath('data.values.representative_name.he', 'רות לוין');

        // The company record itself is not changed by an agreement.
        $this->assertSame('12 Herzl Street, Tel Aviv', \App\Models\Agency::find('AG-9201')->address);

        $this->get('/api/v1/agreements/'.$template['agreementId'].'/file')->assertOk();
    }

    public function test_the_agreement_goes_company_then_admin_then_one_local_agency(): void
    {
        $this->agencyLogin('AG-9301', 'foreign');
        $id = $this->upload()['agreementId'];

        // Nobody else sees a draft.
        $this->asAdmin()->getJson('/api/v1/agreements?company=AG-9301')->assertOk()->assertJsonCount(0, 'data');

        $this->agencyLogin('AG-9302', 'local');
        $this->getJson('/api/v1/agreements')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/agreements/'.$id)->assertNotFound();

        // The company sends it, and can no longer change it.
        $company = User::where('agency_id', 'AG-9301')->first();
        $this->app['auth']->forgetGuards();
        $this->withToken(Jwt::sign($company->toPublic()))
            ->postJson('/api/v1/agreements/'.$id.'/send-to-admin')
            ->assertOk()
            ->assertJsonPath('data.status', 'sent_to_admin');
        $this->putJson('/api/v1/agreements/'.$id, ['title' => 'Changed'])->assertStatus(409);
        $this->deleteJson('/api/v1/agreements/'.$id)->assertStatus(409);
        $this->postJson('/api/v1/agreements/'.$id.'/send-to-agency', ['agencyId' => 'AG-9302'])->assertStatus(403);

        // The admin picks the company, sees it, and passes it to the local agency.
        $this->asAdmin()->getJson('/api/v1/agreements/recipients')
            ->assertOk()
            ->assertJsonFragment(['id' => 'AG-9301', 'agreements' => 1, 'waiting' => 1])
            ->assertJsonFragment(['id' => 'AG-9302', 'name' => 'Skyline Manpower']);
        $this->getJson('/api/v1/agreements?company=AG-9301')->assertOk()->assertJsonCount(1, 'data');
        // It is the company's to fill, not the admin's.
        $this->putJson('/api/v1/agreements/'.$id, ['title' => 'Changed'])->assertStatus(403);
        // Only a local agency can receive it.
        $this->postJson('/api/v1/agreements/'.$id.'/send-to-agency', ['agencyId' => 'AG-9301'])->assertStatus(422);
        $this->postJson('/api/v1/agreements/'.$id.'/send-to-agency', ['agencyId' => 'AG-9302'])
            ->assertOk()
            ->assertJsonPath('data.status', 'sent_to_agency')
            ->assertJsonPath('data.localAgencyName', 'Skyline Manpower');

        // Only now does the local agency see it, read it, and open its PDF.
        $local = User::where('agency_id', 'AG-9302')->first();
        $this->app['auth']->forgetGuards();
        $this->withToken(Jwt::sign($local->toPublic()))
            ->getJson('/api/v1/agreements')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.agencyName', 'Negev Builders Ltd');
        $this->getJson('/api/v1/agreements/'.$id)
            ->assertOk()
            ->assertJsonPath('data.values.company_name.en', 'Negev Builders Ltd')
            // Where each value goes on the original PDF, for the filled copy.
            ->assertJsonPath('data.blanks.company_name.he', [1, 42, 207, 693])
            ->assertJsonPath('data.blanks.employee_address.si', [2, 395, 527, 766]);
        $this->get('/api/v1/agreements/'.$id.'/file')->assertOk();
        // It fills only the employee part, and only once a candidate is on it.
        $this->putJson('/api/v1/agreements/'.$id, ['values' => []])->assertStatus(409);

        // Another local agency still sees nothing.
        $this->agencyLogin('AG-9303', 'local')->getJson('/api/v1/agreements')->assertOk()->assertJsonCount(0, 'data');

        // The admin side's two lists: waiting, and passed on - by company and by local agency.
        $this->asAdmin()->getJson('/api/v1/agreements?company=all&status=sent_to_admin')
            ->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/agreements?status=sent_to_agency&company=AG-9301&localAgency=AG-9302')
            ->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.localAgencyName', 'Skyline Manpower');
        $this->getJson('/api/v1/agreements?status=sent_to_agency&localAgency=AG-9303')
            ->assertOk()->assertJsonCount(0, 'data');
        // Without a filter, the admin's own list stays its own.
        $this->getJson('/api/v1/agreements')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_the_local_agency_assigns_a_candidate_who_fills_the_employee_part(): void
    {
        config(['services.google_translate.key' => null]);

        // Company -> admin -> local agency.
        $this->agencyLogin('AG-9401', 'foreign');
        $id = $this->upload()['agreementId'];
        $this->postJson('/api/v1/agreements/'.$id.'/send-to-admin')->assertOk();
        $this->agencyLogin('AG-9402', 'local');
        $local = User::where('agency_id', 'AG-9402')->first();
        $this->asAdmin()->postJson('/api/v1/agreements/'.$id.'/send-to-agency', ['agencyId' => 'AG-9402'])->assertOk();

        $candidate = fn (string $name, string $nic, ?string $passedAt) => \App\Models\Candidate::create([
            'agency_id' => 'AG-9402',
            'name' => $name,
            'nic_no' => $nic,
            'passport_no' => 'N'.substr($nic, 0, 7),
            'date_of_birth' => '1985-09-20',
            'address' => 'No 316, Ginigalpelessa, Sewanagala',
            'mobile' => '0771234567',
            'passed_at' => $passedAt,
        ]);
        $waiting = $candidate('Nimal Silva', '901112223V', null);
        $later = $candidate('Kamal Perera', '881112223V', '2026-09-10 10:00:00');
        $first = $candidate('Anura Kumara', '852641746V', '2026-09-01 10:00:00');
        // Another agency's candidate is never on the list, nor assignable.
        $elsewhere = \App\Models\Candidate::create([
            'agency_id' => 'AG-9401', 'name' => 'Elsewhere Person', 'nic_no' => '700000000V',
            'passport_no' => 'N7000000', 'address' => 'Tel Aviv', 'mobile' => '0770000000',
        ]);

        $this->app['auth']->forgetGuards();
        $this->withToken(Jwt::sign($local->toPublic()));

        // Passed first, in the order they passed; then the rest.
        $this->getJson('/api/v1/agreements/'.$id.'/candidates')
            ->assertOk()
            ->assertJsonPath('data.0.id', $first->id)
            ->assertJsonPath('data.0.passed', true)
            ->assertJsonPath('data.1.id', $later->id)
            ->assertJsonPath('data.2.id', $waiting->id)
            ->assertJsonPath('data.2.passed', false)
            ->assertJsonCount(3, 'data');

        // Assigning fills the employee part in every language; the employer part stays.
        $this->postJson('/api/v1/agreements/'.$id.'/assign', ['candidateId' => $first->id])
            ->assertOk()
            ->assertJsonPath('data.candidateName', 'Anura Kumara')
            ->assertJsonPath('data.employeeSection.fields.0.key', 'employee_name')
            ->assertJsonPath('data.values.employee_name.en', 'Anura Kumara')
            ->assertJsonPath('data.values.employee_name.auto.he', true)
            ->assertJsonPath('data.values.employee_id_no.si', '852641746V')
            ->assertJsonPath('data.values.passport_no.he', 'N8526417')
            ->assertJsonPath('data.values.date_of_birth.si', '20/09/1985')
            ->assertJsonPath('data.values.employee_address.en', 'No 316, Ginigalpelessa, Sewanagala')
            ->assertJsonPath('data.values.company_name.en', 'Negev Builders Ltd');

        // The local agency corrects the Sinhala; the English stays the candidate's.
        $this->putJson('/api/v1/agreements/'.$id, ['values' => [
            'employee_address' => ['en' => 'Elsewhere', 'si' => 'අංක 316, ගිනිගල්පැලැස්ස, සෙවනගල'],
            'company_name' => ['he' => 'not theirs'],
        ]])
            ->assertOk()
            ->assertJsonPath('data.values.employee_address.en', 'No 316, Ginigalpelessa, Sewanagala')
            ->assertJsonPath('data.values.employee_address.si', 'අංක 316, ගිනිගල්පැලැස්ස, සෙවනගල')
            ->assertJsonPath('data.values.company_name.he', 'נגו בוילדרס בע"מ');

        // Choosing someone else replaces the first.
        $this->postJson('/api/v1/agreements/'.$id.'/assign', ['candidateId' => $later->id])
            ->assertOk()
            ->assertJsonPath('data.values.employee_name.en', 'Kamal Perera');

        // Only the agency's own candidates, and only the local agency assigns.
        $this->postJson('/api/v1/agreements/'.$id.'/assign', ['candidateId' => $elsewhere->id])->assertNotFound();
        $this->asAdmin()->postJson('/api/v1/agreements/'.$id.'/assign', ['candidateId' => $first->id])->assertStatus(403);
    }

    public function test_the_salary_is_written_as_the_paper_prints_it_in_three_languages(): void
    {
        // The amount clause 3a prints, word for word.
        $this->assertSame([
            'en' => 'NIS 6,247.67 (Six thousand two hundred forty-seven New Israeli Shekels and sixty-seven agorot)',
            'he' => '6,247.67 ₪ (ששת אלפים מאתיים ארבעים ושבעה שקלים חדשים ושישים ושבע אגורות)',
            'si' => 'NIS 6,247.67 (නව ඊශ්‍රායල ෂෙකෙල් හයදහස් දෙසිය හතළිස් හතක් සහ ඇගොරොට් හැට හතක්)',
        ], \App\Support\SalaryWords::phrases(6247.67));

        $this->assertSame(
            '6,200.00 ₪ (ששת אלפים ומאתיים שקלים חדשים)',
            \App\Support\SalaryWords::phrases(6200)['he']
        );
        $this->assertSame(
            'NIS 12,000.50 (නව ඊශ්‍රායල ෂෙකෙල් දොළොස්දහසක් සහ ඇගොරොට් පනහක්)',
            \App\Support\SalaryWords::phrases(12000.5)['si']
        );
    }

    public function test_the_company_saves_the_salary_on_its_draft(): void
    {
        $this->agencyLogin('AG-9501', 'foreign');
        $id = $this->upload()['agreementId'];

        $this->putJson('/api/v1/agreements/'.$id.'/salary', ['salary' => 'lots'])->assertStatus(422);

        $this->putJson('/api/v1/agreements/'.$id.'/salary', ['salary' => 7512.4])
            ->assertOk()
            ->assertJsonPath('data.salaryNis', '7512.40')
            ->assertJsonPath('data.values.salary.en', 'NIS 7,512.40 (Seven thousand five hundred twelve New Israeli Shekels and forty agorot)')
            ->assertJsonPath('data.values.salary.he', '7,512.40 ₪ (שבעת אלפים חמש מאות ושנים עשר שקלים חדשים וארבעים אגורות)')
            ->assertJsonPath('data.salarySection.fields.0.key', 'salary')
            // Where the printed amount is covered on page 8.
            ->assertJsonPath('data.blanks.salary.en.cover.0', [8, 323, 384, 503]);

        // Saving the employer part afterwards keeps the salary.
        $this->putJson('/api/v1/agreements/'.$id, ['values' => []])
            ->assertOk()
            ->assertJsonPath('data.values.salary.en', 'NIS 7,512.40 (Seven thousand five hundred twelve New Israeli Shekels and forty agorot)');

        // Once sent, the company still keeps its name and salary up to date;
        // the Hebrew and Sinhala of the employer part are fixed.
        $this->postJson('/api/v1/agreements/'.$id.'/send-to-admin')->assertOk();
        $this->patchJson('/api/v1/agreements/'.$id.'/details', ['title' => 'SEC 2026', 'salary' => 8000])
            ->assertOk()
            ->assertJsonPath('data.title', 'SEC 2026')
            ->assertJsonPath('data.status', 'sent_to_admin')
            ->assertJsonPath('data.values.salary.en', 'NIS 8,000.00 (Eight thousand New Israeli Shekels)');
        $this->patchJson('/api/v1/agreements/'.$id.'/details', [])->assertStatus(422);
        $this->putJson('/api/v1/agreements/'.$id, ['values' => []])->assertStatus(409);

        // The admin never edits it.
        $this->asAdmin()->patchJson('/api/v1/agreements/'.$id.'/details', ['salary' => 9000])->assertStatus(403);
    }

    public function test_the_seal_and_signature_go_on_the_agreement_and_every_side_reads_them(): void
    {
        $this->agencyLogin('AG-9601', 'foreign');
        $id = $this->upload()['agreementId'];
        // A real one-pixel PNG: the test PHP has no GD to draw fake images with.
        $png = fn (string $name) => UploadedFile::fake()->createWithContent($name, base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
        ));

        // Pictures only.
        $this->postJson('/api/v1/agreements/'.$id.'/marks', [
            'type' => 'seal',
            'file' => UploadedFile::fake()->create('seal.pdf', 10, 'application/pdf'),
        ])->assertStatus(422);

        $this->postJson('/api/v1/agreements/'.$id.'/marks', [
            'type' => 'seal',
            'file' => $png('seal.png'),
        ])->assertOk()->assertJsonPath('data.marks.seal', true)->assertJsonPath('data.marks.signature', false);

        $this->postJson('/api/v1/agreements/'.$id.'/marks', [
            'type' => 'signature',
            'file' => $png('signature.png'),
        ])->assertOk()
            ->assertJsonPath('data.marks.signature', true)
            // Where they go on every page, left of the page number.
            ->assertJsonPath('data.markBoxes.seal', [62, 6, 152, 60]);

        $this->get('/api/v1/agreements/'.$id.'/marks/seal')->assertOk();

        // Sent, the company can still replace them.
        $this->postJson('/api/v1/agreements/'.$id.'/send-to-admin')->assertOk();
        $this->postJson('/api/v1/agreements/'.$id.'/marks', [
            'type' => 'seal',
            'file' => $png('seal.png'),
        ])->assertOk();

        $this->agencyLogin('AG-9602', 'local');
        $local = User::where('agency_id', 'AG-9602')->first();
        $this->asAdmin()->postJson('/api/v1/agreements/'.$id.'/send-to-agency', ['agencyId' => 'AG-9602'])->assertOk();
        $this->get('/api/v1/agreements/'.$id.'/marks/signature')->assertOk();

        $this->app['auth']->forgetGuards();
        $this->withToken(Jwt::sign($local->toPublic()))
            ->get('/api/v1/agreements/'.$id.'/marks/seal')->assertOk();
        $this->get('/api/v1/agreements/'.$id.'/marks/stamp')->assertNotFound();
    }

    public function test_a_company_never_sees_another_ones_agreements(): void
    {
        $this->agencyLogin('AG-9202', 'foreign');
        $template = $this->upload();
        $agreement = ['id' => $template['agreementId']];

        // The admin's own upload is not the company's either.
        $adminTemplate = $this->asAdmin()->upload();
        $this->assertNull($adminTemplate['agreementId']);

        $this->agencyLogin('AG-9203', 'foreign')
            ->getJson('/api/v1/agreement-templates')
            ->assertOk()
            ->assertJsonCount(0, 'data.templates');
        $this->getJson('/api/v1/agreements')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/agreements/'.$agreement['id'])->assertNotFound();
        $this->deleteJson('/api/v1/agreements/'.$agreement['id'])->assertNotFound();
        $this->postJson('/api/v1/agreements/'.$agreement['id'].'/send-to-admin')->assertNotFound();
        $this->get('/api/v1/agreement-templates/'.$template['id'].'/file')->assertNotFound();
        $this->postJson('/api/v1/agreements', ['templateId' => $adminTemplate['id'], 'title' => 'Someone'])
            ->assertNotFound();

        // And the admin's own list is its own.
        $this->asAdmin()->getJson('/api/v1/agreement-templates')->assertOk()->assertJsonCount(1, 'data.templates');
    }

    public function test_a_local_agency_does_not_upload_or_fill(): void
    {
        $this->agencyLogin('AG-9204', 'local')
            ->getJson('/api/v1/agreement-templates')
            ->assertStatus(403);
        $this->postJson('/api/v1/agreements/translate', ['texts' => ['Tiler']])->assertStatus(403);
        $this->getJson('/api/v1/agreements/recipients')->assertStatus(403);
    }

    public function test_a_company_deletes_its_draft_and_the_pdf_with_it(): void
    {
        $this->agencyLogin('AG-9205', 'foreign');
        $template = $this->upload();

        $this->deleteJson('/api/v1/agreements/'.$template['agreementId'])->assertOk();
        $this->getJson('/api/v1/agreement-templates')->assertOk()->assertJsonCount(0, 'data.templates');
    }

    public function test_a_company_saves_the_pdf_it_uses_every_time_and_starts_agreements_from_it(): void
    {
        config(['services.google_translate.key' => null]);
        $this->agencyLogin('AG-9206', 'foreign');

        // Saved, the PDF is kept on its own - no agreement comes of it yet.
        $saved = $this->postJson('/api/v1/agreement-templates', [
            'name' => 'Our standard agreement',
            'layout' => AgreementLayout::SEC_CONSTRUCTION_2025,
            'file' => UploadedFile::fake()->create('standard.pdf', 200, 'application/pdf'),
            'saved' => true,
        ])->assertCreated()->assertJsonPath('data.saved', true)->json('data');
        $this->assertNull($saved['agreementId']);
        $this->getJson('/api/v1/agreements')->assertOk()->assertJsonCount(0, 'data');

        // Each agreement started from it is filled like an upload.
        $agreement = $this->postJson('/api/v1/agreements', ['templateId' => $saved['id'], 'title' => 'Kamal 2026'])
            ->assertCreated()
            ->assertJsonPath('data.values.company_name.en', 'Negev Builders Ltd')
            ->json('data');

        // Deleting that agreement leaves the saved PDF for the next one.
        $this->deleteJson('/api/v1/agreements/'.$agreement['id'])->assertOk();
        $this->getJson('/api/v1/agreement-templates')->assertOk()->assertJsonPath('data.templates.0.saved', true);

        // Removed from the saved list while an agreement still uses it, the PDF stays for that agreement.
        $second = $this->postJson('/api/v1/agreements', ['templateId' => $saved['id'], 'title' => 'Nimal 2026'])
            ->assertCreated()->json('data');
        $this->deleteJson('/api/v1/agreement-templates/'.$saved['id'])->assertOk();
        $this->getJson('/api/v1/agreement-templates')->assertOk()->assertJsonPath('data.templates.0.saved', false);
        $this->get('/api/v1/agreements/'.$second['id'].'/file')->assertOk();
    }

    public function test_a_coordinator_gets_in_once_the_page_is_opened_to_them(): void
    {
        $coordinator = function (array $pages, string $username, string $phone) {
            $this->app['auth']->forgetGuards();
            $id = $this->withToken($this->admin)->postJson('/api/v1/coordinators', [
                'name' => 'Kasun Jayawardena',
                'username' => $username,
                'email' => $username.'@example.lk',
                'phone' => $phone,
                'pages' => $pages,
            ])->assertCreated()->json('data.id');

            $this->app['auth']->forgetGuards();

            return $this->withToken(Jwt::sign(User::findOrFail($id)->toPublic()));
        };

        // Without the page, nothing.
        $coordinator(['candidates'], 'kasun.coord', '0715550101')
            ->getJson('/api/v1/agreement-templates')
            ->assertStatus(403);

        // With it, the same screens as the Main Admin.
        $coordinator(['agreements'], 'nimal.coord', '0715550102')
            ->getJson('/api/v1/agreement-templates')
            ->assertOk();
        $this->postJson('/api/v1/agreement-templates', [
            'name' => 'SEC Construction 2025',
            'layout' => AgreementLayout::SEC_CONSTRUCTION_2025,
            'file' => UploadedFile::fake()->create('employment_agreement.pdf', 200, 'application/pdf'),
        ])->assertCreated();
    }
}
