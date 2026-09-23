<?php

namespace Tests\Feature;

use App\Models\Country;
use App\Models\User;
use App\Support\Jwt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The countries offered where a foreign company's country is asked for.
 *
 * Anybody may read the list - an agency registering itself picks its country
 * before it has a login - and only the Main Admin and coordinators change it.
 */
class CountryListTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    private function adminToken(): string
    {
        return Jwt::sign(User::where('role_slug', 'main_admin')->firstOrFail()->toPublic());
    }

    public function test_anybody_reads_the_list_without_signing_in(): void
    {
        $this->getJson('/api/v1/countries')
            ->assertOk()
            ->assertJsonFragment(['name' => 'Israel']);
    }

    public function test_the_admin_adds_a_country_and_takes_one_off_the_list(): void
    {
        $added = $this->withToken($this->adminToken())
            ->postJson('/api/v1/countries', ['name' => 'Romania'])
            ->assertCreated()
            ->json('data');

        // The same one twice is refused rather than listed twice.
        $this->postJson('/api/v1/countries', ['name' => 'romania'])->assertStatus(409);

        $this->deleteJson('/api/v1/countries/'.$added['id'])->assertOk();
        $this->getJson('/api/v1/countries')->assertOk()->assertJsonMissing(['name' => 'Romania']);

        // Taken off the list, the row stays - adding it again brings it back.
        $this->assertFalse(Country::find($added['id'])->active);
        $this->postJson('/api/v1/countries', ['name' => 'Romania'])
            ->assertOk()
            ->assertJsonPath('data.id', $added['id']);
    }

    public function test_an_agency_cannot_change_the_list(): void
    {
        $owner = User::create([
            'name' => 'Owner',
            'username' => 'country.owner',
            'email' => 'country.owner@example.com',
            'phone' => '0771234599',
            'password_hash' => password_hash('Passw0rd1', PASSWORD_BCRYPT),
            'role_slug' => 'agency_owner',
            'status' => 'active',
        ]);

        $this->withToken(Jwt::sign($owner->toPublic()))
            ->postJson('/api/v1/countries', ['name' => 'Nowhere'])
            ->assertForbidden();

        $this->deleteJson('/api/v1/countries/1')->assertForbidden();
    }
}
