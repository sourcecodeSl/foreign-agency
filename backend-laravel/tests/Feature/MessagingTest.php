<?php

namespace Tests\Feature;

use App\Models\Agency;
use App\Models\User;
use App\Support\Jwt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Messages run between the admin side and one agency at a time. A company or
 * a local agency sees only its own conversation with the admin; the admin
 * side sees them all and forwards between them without saying where from.
 */
class MessagingTest extends TestCase
{
    use RefreshDatabase;

    private string $admin;

    private string $company;

    private string $rival;

    private string $local;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        Storage::fake('local');

        $this->admin = Jwt::sign(User::where('role_slug', 'main_admin')->first()->toPublic());
        $this->company = $this->agencyWithOwner('AG-9101', 'Tel Aviv Builders', 'foreign', 'Israel', '0712000101');
        $this->rival = $this->agencyWithOwner('AG-9102', 'Haifa Works', 'foreign', 'Israel', '0712000102');
        $this->local = $this->agencyWithOwner('AG-9103', 'Skyline Manpower', 'local', 'Sri Lanka', '0712000103');
    }

    private function agencyWithOwner(string $id, string $name, string $type, string $country, string $phone): string
    {
        Agency::create([
            'id' => $id,
            'name' => $name,
            'code' => 'C-'.substr($id, 3),
            'type' => $type,
            'country' => $country,
            'address' => '12 Main Street',
            'username' => strtolower(str_replace(' ', '.', $name)),
            'contact' => 'Owner',
            'email' => 'owner@'.substr($id, 3).'.test',
            'status' => 'active',
        ]);

        $owner = User::create([
            'name' => $name.' Owner',
            'username' => strtolower(str_replace(' ', '.', $name)).'.owner',
            'email' => 'owner@'.substr($id, 3).'.test',
            'phone' => $phone,
            'password_hash' => password_hash('Passw0rd1', PASSWORD_BCRYPT),
            'role_slug' => 'agency_owner',
            'agency_id' => $id,
            'status' => 'active',
        ]);

        return Jwt::sign($owner->toPublic());
    }

    private function as(string $token)
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken($token);
    }

    private function send(string $token, string $agencyId, string $body): array
    {
        return $this->as($token)->postJson('/api/v1/messages/'.$agencyId, ['body' => $body])
            ->assertCreated()->json('data');
    }

    public function test_a_message_goes_sent_delivered_read_with_the_ticks(): void
    {
        $sent = $this->send($this->admin, 'AG-9101', 'Please send the test dates.');
        $this->assertSame('sent', $sent['status']);
        $this->assertTrue($sent['outgoing']);

        // The company has the system open: the badge poll delivers it.
        $this->as($this->company)->getJson('/api/v1/messages/unread')
            ->assertOk()->assertJsonPath('data.total', 1);
        $this->as($this->admin)->getJson('/api/v1/messages/AG-9101')
            ->assertJsonPath('data.messages.0.status', 'delivered');

        // Opening the conversation reads it.
        $this->as($this->company)->getJson('/api/v1/messages/AG-9101')
            ->assertOk()
            ->assertJsonPath('data.conversation.name', 'Admin')
            ->assertJsonPath('data.messages.0.senderName', 'Admin')
            ->assertJsonPath('data.messages.0.outgoing', false);
        $this->as($this->admin)->getJson('/api/v1/messages/AG-9101')
            ->assertJsonPath('data.messages.0.status', 'read');
        $this->as($this->company)->getJson('/api/v1/messages/unread')->assertJsonPath('data.total', 0);
    }

    public function test_a_company_sees_only_its_own_conversation_and_talks_only_to_the_admin(): void
    {
        $this->send($this->admin, 'AG-9102', 'For Haifa only.');

        // Another company's conversation is not there at all.
        $this->as($this->company)->getJson('/api/v1/messages/AG-9102')->assertNotFound();
        $this->as($this->company)->postJson('/api/v1/messages/AG-9103', ['body' => 'Hi'])->assertNotFound();
        $this->as($this->company)->getJson('/api/v1/messages/conversations')->assertForbidden();

        $this->as($this->company)->getJson('/api/v1/messages/AG-9101')
            ->assertOk()->assertJsonCount(0, 'data.messages');
    }

    public function test_the_admin_lists_companies_and_agencies_with_unread_counts(): void
    {
        $this->send($this->company, 'AG-9101', 'Test dates attached.');
        $this->send($this->company, 'AG-9101', 'And the venue.');

        $list = collect($this->as($this->admin)->getJson('/api/v1/messages/conversations')
            ->assertOk()->json('data'))->keyBy('id');

        $this->assertSame('foreign', $list['AG-9101']['type']);
        $this->assertSame('Israel', $list['AG-9101']['country']);
        $this->assertSame(2, $list['AG-9101']['unread']);
        $this->assertSame('And the venue.', $list['AG-9101']['lastMessage']['preview']);
        $this->assertSame('local', $list['AG-9103']['type']);
        $this->assertSame(0, $list['AG-9103']['unread']);
        // The company signed in just now to send, so it shows online.
        $this->assertTrue($list['AG-9101']['online']);

        // The bell says so too, and links to the conversation.
        $bell = collect($this->as($this->admin)->getJson('/api/v1/notifications')->json('data'))
            ->firstWhere('link', '/messages?c=AG-9101');
        $this->assertSame('2 new messages from Tel Aviv Builders', $bell['title']);
    }

    public function test_only_the_sender_edits_or_deletes_a_message(): void
    {
        $message = $this->send($this->company, 'AG-9101', 'Tomorow at 9.');

        $this->as($this->admin)->patchJson('/api/v1/messages/AG-9101/'.$message['id'], ['body' => 'x'])
            ->assertForbidden();

        $this->as($this->company)->patchJson('/api/v1/messages/AG-9101/'.$message['id'], ['body' => 'Tomorrow at 9.'])
            ->assertOk()
            ->assertJsonPath('data.body', 'Tomorrow at 9.')
            ->assertJsonPath('data.edited', true);

        $this->as($this->company)->deleteJson('/api/v1/messages/AG-9101/'.$message['id'])
            ->assertOk()
            ->assertJsonPath('data.deleted', true)
            ->assertJsonPath('data.body', null);

        $this->as($this->admin)->getJson('/api/v1/messages/AG-9101')
            ->assertJsonPath('data.messages.0.deleted', true)
            ->assertJsonPath('data.messages.0.body', null);
    }

    public function test_the_admin_forwards_a_company_message_to_agencies_without_naming_the_company(): void
    {
        $message = $this->as($this->company)->post('/api/v1/messages/AG-9101', [
            'body' => 'Our job order',
            'file' => UploadedFile::fake()->create('order.pdf', 30, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertCreated()->json('data');

        // Only the admin side forwards.
        $this->as($this->company)->postJson('/api/v1/messages/AG-9101/'.$message['id'].'/forward', ['to' => ['AG-9103']])
            ->assertForbidden();

        $this->as($this->admin)->postJson('/api/v1/messages/AG-9101/'.$message['id'].'/forward', ['to' => ['AG-9103']])
            ->assertOk()->assertJsonPath('data.forwarded', 1);

        $copy = $this->as($this->local)->getJson('/api/v1/messages/AG-9103')
            ->assertOk()
            ->assertJsonPath('data.messages.0.forwarded', true)
            ->assertJsonPath('data.messages.0.senderName', 'Admin')
            ->assertJsonPath('data.messages.0.body', 'Our job order')
            ->assertJsonPath('data.messages.0.attachment.name', 'order.pdf')
            ->json('data.messages.0');
        $this->assertStringNotContainsString('Tel Aviv', json_encode($copy));

        $this->as($this->local)->get('/api/v1/messages/AG-9103/'.$copy['id'].'/file')->assertOk();
        // The file of the original is not the local agency's to open.
        $this->as($this->local)->get('/api/v1/messages/AG-9101/'.$message['id'].'/file')->assertNotFound();
    }

    public function test_a_coordinator_needs_the_messages_page_opened(): void
    {
        $coordinator = $this->as($this->admin)->postJson('/api/v1/coordinators', [
            'name' => 'Kasun Jayawardena',
            'username' => 'kasun.coord',
            'email' => 'kasun@example.lk',
            'phone' => '0715550101',
            'pages' => ['dashboard'],
        ])->assertCreated()->json('data');
        $token = Jwt::sign(User::findOrFail($coordinator['id'])->toPublic());

        $this->as($token)->getJson('/api/v1/messages/conversations')->assertForbidden();

        $this->as($this->admin)->putJson('/api/v1/coordinators/'.$coordinator['id'], ['pages' => ['messages']])
            ->assertOk();
        $this->as($token)->getJson('/api/v1/messages/conversations')->assertOk();
        $this->send($token, 'AG-9102', 'From the coordinator.');
    }
}
