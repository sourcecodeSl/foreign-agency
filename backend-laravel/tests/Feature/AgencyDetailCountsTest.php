<?php

namespace Tests\Feature;

use App\Models\Agency;
use App\Models\User;
use App\Support\Jwt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The counts on the admin's agency card come from what is on file right now,
 * not from numbers stored when the agency was created.
 */
class AgencyDetailCountsTest extends TestCase
{
    use RefreshDatabase;

    private string $admin;

    private string $owner;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();

        Agency::create([
            'id' => 'AG-9001',
            'name' => 'Skyline Manpower',
            'code' => 'SKY-9001',
            'address' => '221B Baker Street, Colombo 03',
            'username' => 'skyline.owner',
            'contact' => 'Nadia Perera',
            'email' => 'owner@skyline.lk',
            // Stale on purpose: nothing ever kept this column up to date.
            'users' => 7,
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

        User::create([
            'name' => 'Kasun Silva',
            'username' => 'skyline.agent',
            'email' => 'agent@skyline.lk',
            'phone' => '0712000002',
            'password_hash' => password_hash('Passw0rd1', PASSWORD_BCRYPT),
            'role_slug' => 'agent',
            'agency_id' => 'AG-9001',
            'status' => 'active',
        ]);

        $this->app['auth']->forgetGuards();
        $this->owner = Jwt::sign($owner->toPublic());
        $this->admin = Jwt::sign(User::where('role_slug', 'main_admin')->first()->toPublic());
    }

    private function register(string $name, string $passport): int
    {
        return $this->withToken($this->owner)->postJson('/api/v1/candidates', [
            'name' => $name,
            'passportNo' => $passport,
            'address' => '12 Temple Road, Negombo',
            'mobile' => '0771234567',
        ])->assertCreated()->json('data.candidate.id');
    }

    private function card()
    {
        return $this->withToken($this->admin)->getJson('/api/v1/agencies/AG-9001')->assertOk();
    }

    public function test_the_card_counts_only_what_is_on_file_now(): void
    {
        $this->register('Kamal Perera', 'N1000001');
        $removed = $this->register('Nimal Silva', 'N1000002');

        // The agency removes one, so it is gone from the agency's own list.
        $this->withToken($this->owner)->deleteJson('/api/v1/candidates/'.$removed)->assertOk();

        $this->card()
            ->assertJsonPath('data.candidates', 1)
            ->assertJsonPath('data.users', 2);

        // A new registration shows up on the very next read.
        $this->register('Sunil Fernando', 'N1000003');

        $this->card()->assertJsonPath('data.candidates', 2);
    }

    public function test_the_listing_counts_logins_instead_of_the_stored_number(): void
    {
        $this->withToken($this->admin)
            ->getJson('/api/v1/agencies?status=all&search=SKY-9001')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.users', 2);
    }
}
