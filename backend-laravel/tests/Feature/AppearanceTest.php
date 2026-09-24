<?php

namespace Tests\Feature;

use App\Models\Agency;
use App\Models\User;
use App\Support\Jwt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Each login keeps its own look of the interface - the admin side, a foreign
 * company and a local agency alike - and changes only its own.
 */
class AppearanceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    private function as(string $token)
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken($token);
    }

    private function agencyLogin(string $id, string $type, string $phone): string
    {
        Agency::create([
            'id' => $id,
            'name' => 'Agency '.$id,
            'code' => 'AG-'.substr($id, 3),
            'type' => $type,
            'address' => '1 Main Street, Colombo',
            'contact' => 'Owner',
            'email' => strtolower($id).'@example.com',
            'status' => 'active',
        ]);

        $user = User::create([
            'name' => 'Owner '.$id,
            'username' => strtolower($id).'.owner',
            'email' => strtolower($id).'@example.com',
            'phone' => $phone,
            'password_hash' => password_hash('Passw0rd1', PASSWORD_BCRYPT),
            'role_slug' => 'agency_owner',
            'agency_id' => $id,
            'status' => 'active',
        ]);

        return Jwt::sign($user->toPublic());
    }

    public function test_every_role_keeps_its_own_appearance(): void
    {
        $admin = Jwt::sign(User::where('role_slug', 'main_admin')->firstOrFail()->toPublic());
        $local = $this->agencyLogin('AG-9001', 'local', '0712000001');
        $company = $this->agencyLogin('AG-9100', 'foreign', '0712000002');

        // The defaults until something is chosen.
        $this->assertSame(
            [
                'mode' => 'light', 'accent' => 'blue', 'sidebar' => 'default', 'textSize' => 'default',
                'customAccent' => '#3363ff', 'sidebarColor' => '#1a288f',
            ],
            $this->as($local)->getJson('/api/v1/account/appearance')->assertOk()->json('data')
        );

        // Only what is sent changes.
        $this->putJson('/api/v1/account/appearance', ['mode' => 'dark', 'accent' => 'emerald'])
            ->assertOk()
            ->assertJsonPath('data.mode', 'dark')
            ->assertJsonPath('data.accent', 'emerald')
            ->assertJsonPath('data.sidebar', 'default');
        $this->putJson('/api/v1/account/appearance', ['sidebar' => 'brand', 'textSize' => 'large'])->assertOk();
        $this->getJson('/api/v1/account/appearance')
            ->assertJsonPath('data.mode', 'dark')
            ->assertJsonPath('data.sidebar', 'brand')
            ->assertJsonPath('data.textSize', 'large');

        // A colour picked by hand, for the accent and for the sidebar.
        $this->putJson('/api/v1/account/appearance', [
            'accent' => 'custom', 'customAccent' => '#FF6B35',
            'sidebar' => 'custom', 'sidebarColor' => '#2d1b4e',
        ])->assertOk()
            ->assertJsonPath('data.accent', 'custom')
            ->assertJsonPath('data.customAccent', '#ff6b35')
            ->assertJsonPath('data.sidebarColor', '#2d1b4e');
        $this->putJson('/api/v1/account/appearance', ['customAccent' => 'orange'])->assertStatus(422);
        $this->putJson('/api/v1/account/appearance', ['sidebarColor' => '#12345'])->assertStatus(422);

        // Nothing outside the choices on offer.
        $this->putJson('/api/v1/account/appearance', ['accent' => 'neon'])->assertStatus(422);
        $this->putJson('/api/v1/account/appearance', ['mode' => 'sepia'])->assertStatus(422);

        // The foreign company and the admin have their own, untouched by the agency's.
        $this->as($company)->putJson('/api/v1/account/appearance', ['accent' => 'rose'])->assertOk()
            ->assertJsonPath('data.mode', 'light');
        $this->as($admin)->getJson('/api/v1/account/appearance')->assertOk()
            ->assertJsonPath('data.accent', 'blue');
        $this->as($local)->getJson('/api/v1/account/appearance')->assertJsonPath('data.accent', 'custom');
    }

    public function test_the_appearance_needs_a_signed_in_account(): void
    {
        $this->getJson('/api/v1/account/appearance')->assertUnauthorized();
    }
}
