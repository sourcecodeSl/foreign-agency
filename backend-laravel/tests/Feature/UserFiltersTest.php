<?php

namespace Tests\Feature;

use App\Models\Agency;
use App\Models\User;
use App\Support\Jwt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** The Users list, narrowed to local agencies, foreign companies, or one agency. */
class UserFiltersTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();

        foreach ([['AG-7001', 'local', 'Skyline'], ['AG-7002', 'foreign', 'Negev'], ['AG-7003', null, 'Old Lanka']] as [$id, $type, $name]) {
            Agency::create([
                'id' => $id, 'name' => $name, 'code' => 'C-'.$id, 'type' => $type ?? 'local',
                'address' => 'Colombo', 'username' => strtolower($id), 'password_hash' => 'x',
                'contact' => 'Nadia', 'email' => strtolower($id).'@example.com', 'status' => 'active',
            ]);
            User::create([
                'name' => $name.' Owner', 'username' => strtolower($id).'.owner',
                'email' => strtolower($id).'.owner@example.com', 'phone' => '07140'.substr($id, 3),
                'password_hash' => 'x', 'role_slug' => 'agency_owner', 'agency_name' => $name,
                'agency_id' => $id, 'status' => 'active',
            ]);
        }

        $this->withToken(Jwt::sign(User::where('role_slug', 'main_admin')->first()->toPublic()));
    }

    private function names(string $query): array
    {
        return collect($this->getJson('/api/v1/users?'.$query)->assertOk()->json('data'))
            ->pluck('name')->sort()->values()->all();
    }

    public function test_users_narrow_to_local_agencies_or_foreign_companies(): void
    {
        $this->assertSame(['Old Lanka Owner', 'Skyline Owner'], $this->names('agencyType=local'));
        $this->assertSame(['Negev Owner'], $this->names('agencyType=foreign'));
        $this->assertNotContains('Negev Owner', $this->names('agencyType=main'));
        $this->assertContains('Main Admin', collect($this->getJson('/api/v1/users?agencyType=main')->json('data'))->pluck('role')->all());
    }

    public function test_users_narrow_to_one_agency_and_say_which_kind_it_is(): void
    {
        $this->assertSame(['Negev Owner'], $this->names('agencyType=foreign&agency=AG-7002'));

        $this->getJson('/api/v1/users?agency=AG-7002')
            ->assertOk()
            ->assertJsonPath('data.0.agencyType', 'foreign');

        // The role filter reads the role's slug.
        $this->assertSame(['Negev Owner', 'Old Lanka Owner', 'Skyline Owner'], $this->names('role=agency_owner'));
    }
}
