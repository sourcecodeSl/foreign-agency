<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\Jwt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * Creating an agency emails its sign-in details to the address it was
 * registered with, and tells the admin whether that email actually went out.
 */
class AgencyCredentialsEmailTest extends TestCase
{
    use RefreshDatabase;

    private string $admin;

    /** Environment values changed by a test, restored afterwards. */
    private array $original = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();

        $this->app['auth']->forgetGuards();
        $this->admin = Jwt::sign(User::where('role_slug', 'main_admin')->first()->toPublic());
    }

    protected function tearDown(): void
    {
        foreach ($this->original as $key => $value) {
            if ($value === null) {
                unset($_SERVER[$key]);
            } else {
                $_SERVER[$key] = $value;
            }
        }

        parent::tearDown();
    }

    private function setEnv(string $key, string $value): void
    {
        if (! array_key_exists($key, $this->original)) {
            $this->original[$key] = $_SERVER[$key] ?? null;
        }
        $_SERVER[$key] = $value;
    }

    /**
     * Makes the service believe SMTP is set up, while the messages land in
     * the array transport where the test can read them.
     */
    private function configureMail(): void
    {
        $this->setEnv('MAIL_MAILER', 'smtp');
        $this->setEnv('MAIL_USERNAME', 'mailer@example.com');
        $this->setEnv('MAIL_PASSWORD', 'not-a-real-password');
        config(['mail.default' => 'array']);
    }

    private function createAgency(string $name = 'Skyline Marketing')
    {
        return $this->withToken($this->admin)->postJson('/api/v1/agencies', [
            'name' => $name,
            'contact' => 'Nadia Perera',
            'address' => '221B Baker Street, Colombo 03',
            'username' => 'skyline.owner',
            'password' => 'Passw0rd1',
            'email' => 'Owner@Skyline.lk',
            'phone' => '0771234567',
        ])->assertCreated();
    }

    public function test_the_credentials_are_emailed_to_the_address_on_the_form(): void
    {
        $this->configureMail();

        $this->createAgency()
            ->assertJsonPath('data.credentialsEmail.to', 'owner@skyline.lk')
            ->assertJsonPath('data.credentialsEmail.delivered', true);

        $messages = Mail::mailer('array')->getSymfonyTransport()->messages();
        $this->assertCount(1, $messages);

        $email = $messages->first()->getOriginalMessage();
        $this->assertSame('owner@skyline.lk', $email->getTo()[0]->getAddress());

        $html = $email->getHtmlBody();
        $this->assertStringContainsString('Skyline Marketing', $html);
        $this->assertStringContainsString('skyline.owner', $html);
        $this->assertStringContainsString('Passw0rd1', $html);
        $this->assertStringContainsString('awaiting approval', $html);
    }

    public function test_what_was_typed_into_the_form_cannot_inject_markup(): void
    {
        $this->configureMail();

        $this->createAgency('Skyline <b>Marketing</b>');

        $html = Mail::mailer('array')->getSymfonyTransport()->messages()
            ->first()->getOriginalMessage()->getHtmlBody();

        $this->assertStringContainsString('Skyline &lt;b&gt;Marketing&lt;/b&gt;', $html);
        $this->assertStringNotContainsString('<b>Marketing</b>', $html);
    }

    public function test_without_mail_set_up_the_agency_is_still_created_and_the_screen_is_told(): void
    {
        $this->createAgency()
            ->assertJsonPath('data.credentialsEmail.to', 'owner@skyline.lk')
            ->assertJsonPath('data.credentialsEmail.delivered', false)
            // The credentials are still there to copy by hand.
            ->assertJsonPath('data.credentials.username', 'skyline.owner');

        $this->assertDatabaseHas('users', ['username' => 'skyline.owner']);
    }
}
