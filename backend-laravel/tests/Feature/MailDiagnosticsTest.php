<?php

namespace Tests\Feature;

use App\Models\Agency;
use App\Models\User;
use App\Support\Jwt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * The administrator's email delivery check: what this server reads for mail,
 * and a test email that comes back with the real error when it fails.
 */
class MailDiagnosticsTest extends TestCase
{
    use RefreshDatabase;

    private User $adminUser;

    private string $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();

        $this->adminUser = User::where('role_slug', 'main_admin')->first();
        $this->app['auth']->forgetGuards();
        $this->admin = Jwt::sign($this->adminUser->toPublic());
    }

    private function smtp(array $overrides = []): void
    {
        config(array_merge([
            'mail.default' => 'smtp',
            'mail.mailers.smtp.host' => 'smtp.gmail.com',
            'mail.mailers.smtp.port' => 587,
            'mail.mailers.smtp.username' => 'mailer@example.com',
            'mail.mailers.smtp.password' => 'not-a-real-password',
        ], $overrides));
    }

    public function test_it_reports_what_the_server_reads_but_never_the_password(): void
    {
        $this->smtp();

        $response = $this->withToken($this->admin)->getJson('/api/v1/system/mail')
            ->assertOk()
            ->assertJsonPath('data.mailer', 'smtp')
            ->assertJsonPath('data.host', 'smtp.gmail.com')
            ->assertJsonPath('data.usernameSet', true)
            ->assertJsonPath('data.passwordSet', true)
            ->assertJsonPath('data.configured', true)
            ->assertJsonPath('data.configCached', false)
            ->assertJsonPath('data.testRecipient', $this->adminUser->email);

        $this->assertStringEndsWith('.env', $response->json('data.envFile'));
        $this->assertStringNotContainsString('not-a-real-password', $response->getContent());
    }

    public function test_the_test_email_goes_to_the_administrator_and_nobody_else(): void
    {
        // Counts as SMTP, but the message lands in memory.
        $this->smtp(['mail.mailers.smtp.transport' => 'array']);

        $this->withToken($this->admin)
            ->postJson('/api/v1/system/mail/test', ['to' => 'someone@elsewhere.com'])
            ->assertOk()
            ->assertJsonPath('data.delivered', true)
            ->assertJsonPath('data.to', $this->adminUser->email);

        $messages = Mail::mailer('smtp')->getSymfonyTransport()->messages();
        $this->assertCount(1, $messages);
        $this->assertSame(
            $this->adminUser->email,
            $messages->first()->getOriginalMessage()->getTo()[0]->getAddress()
        );
    }

    public function test_a_failed_send_comes_back_with_the_mail_servers_reason(): void
    {
        // Nothing listens on port 1, so the connection is refused - the same
        // thing a host that blocks outgoing SMTP does.
        $this->smtp([
            'mail.mailers.smtp.host' => '127.0.0.1',
            'mail.mailers.smtp.port' => 1,
            'mail.mailers.smtp.timeout' => 5,
        ]);

        $response = $this->withToken($this->admin)->postJson('/api/v1/system/mail/test')
            ->assertOk()
            ->assertJsonPath('data.delivered', false);

        $this->assertNotEmpty($response->json('data.error'));
    }

    public function test_without_mail_settings_the_check_says_so(): void
    {
        $response = $this->withToken($this->admin)->postJson('/api/v1/system/mail/test')
            ->assertOk()
            ->assertJsonPath('data.delivered', false);

        $this->assertStringContainsString('not set up', $response->json('data.error'));
    }

    public function test_cached_settings_can_be_cleared_without_a_terminal(): void
    {
        $this->withToken($this->admin)->postJson('/api/v1/system/mail/clear-cache')
            ->assertOk()
            ->assertJsonPath('data.wasCached', false);
    }

    public function test_only_the_administrator_can_use_it(): void
    {
        Agency::create([
            'id' => 'AG-9001',
            'name' => 'Skyline Manpower',
            'code' => 'SKY-9001',
            'address' => '221B Baker Street, Colombo 03',
            'username' => 'skyline.owner',
            'contact' => 'Nadia Perera',
            'email' => 'owner@skyline.lk',
            'status' => 'active',
        ]);
        $owner = User::create([
            'name' => 'Nadia Perera',
            'username' => 'skyline.owner',
            'email' => 'owner@skyline.lk',
            'phone' => '0712000001',
            'password_hash' => password_hash('Passw0rd1', PASSWORD_BCRYPT),
            'role_slug' => 'agency_owner',
            'agency_id' => 'AG-9001',
            'status' => 'active',
        ]);
        $this->app['auth']->forgetGuards();
        $token = Jwt::sign($owner->toPublic());

        $this->withToken($token)->getJson('/api/v1/system/mail')->assertStatus(403);
        $this->withToken($token)->postJson('/api/v1/system/mail/test')->assertStatus(403);
        $this->withToken($token)->postJson('/api/v1/system/mail/clear-cache')->assertStatus(403);
    }
}
