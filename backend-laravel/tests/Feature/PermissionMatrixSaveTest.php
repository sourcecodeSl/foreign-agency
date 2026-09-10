<?php

namespace Tests\Feature;

use App\Models\Agency;
use App\Models\Role;
use App\Models\User;
use App\Support\Jwt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Saving the permission screen must not take away what it never showed.
 *
 * cleanMatrix rebuilds the whole grid from the payload and reads an absent
 * module as "no access". A screen that renders six of the seven modules
 * therefore revoked the seventh on every save - which is how agency logins
 * lost the candidates module on the live site and could no longer register
 * anybody.
 */
class PermissionMatrixSaveTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    private function adminToken(): string
    {
        $this->app['auth']->forgetGuards();

        return Jwt::sign(User::where('role_slug', 'main_admin')->firstOrFail()->toPublic());
    }

    /** The full grid as the screen should send it. */
    private function fullMatrix(array $overrides = []): array
    {
        $matrix = [];
        foreach (Role::MODULES as $module) {
            $matrix[$module] = ['view' => false, 'create' => false, 'edit' => false, 'delete' => false];
        }

        return array_replace($matrix, $overrides);
    }

    public function test_a_save_that_leaves_a_module_out_is_refused(): void
    {
        $before = Role::where('slug', 'agency_owner')->firstOrFail()->permissions;
        $this->assertTrue($before['candidates']['create']);

        // Exactly what the old screen sent: every module except candidates.
        $partial = $this->fullMatrix();
        unset($partial['candidates']);

        $this->withToken($this->adminToken())
            ->putJson('/api/v1/roles/agency_owner/permissions', ['permissions' => $partial])
            ->assertStatus(422)
            ->assertJsonPath('errors.permissions', 'Missing module(s): candidates.');

        // Nothing was written, so the grant survives.
        $after = Role::where('slug', 'agency_owner')->firstOrFail()->permissions;
        $this->assertSame($before, $after);
    }

    public function test_an_agency_owner_can_still_register_after_such_a_save(): void
    {
        $agency = Agency::create([
            'id' => 'AG-9001',
            'name' => 'Skyline Manpower',
            'code' => 'SKY-9001',
            'address' => '221B Baker Street, Colombo 03',
            'username' => 'tst.skyline',
            'contact' => 'Nadia Perera',
            'email' => 'skyline@example.lk',
            'status' => 'active',
        ]);

        $owner = User::create([
            'name' => 'Nadia Perera',
            'username' => 'skyline.owner',
            'email' => 'owner@skyline.lk',
            'phone' => '0712000001',
            'password_hash' => password_hash('Passw0rd1', PASSWORD_BCRYPT),
            'role_slug' => 'agency_owner',
            'agency_id' => $agency->id,
            'status' => 'active',
        ]);

        $partial = $this->fullMatrix();
        unset($partial['candidates']);

        $this->withToken($this->adminToken())
            ->putJson('/api/v1/roles/agency_owner/permissions', ['permissions' => $partial])
            ->assertStatus(422);

        $this->app['auth']->forgetGuards();

        // The exact thing that was broken on live.
        $this->withToken(Jwt::sign($owner->toPublic()))
            ->postJson('/api/v1/candidates', [
                'name' => 'Kamal Perera',
                'passportNo' => 'N7788990',
                'address' => '12 Temple Road, Negombo',
                'mobile' => '0771234567',
            ])
            ->assertCreated();
    }

    public function test_a_complete_save_still_works_and_can_revoke(): void
    {
        // Turning something off deliberately has to keep working.
        $matrix = $this->fullMatrix([
            'candidates' => ['view' => true, 'create' => false, 'edit' => true, 'delete' => false],
        ]);

        $this->withToken($this->adminToken())
            ->putJson('/api/v1/roles/agency_owner/permissions', ['permissions' => $matrix])
            ->assertOk()
            ->assertJsonPath('data.candidates.create', false)
            ->assertJsonPath('data.candidates.view', true);

        $saved = Role::where('slug', 'agency_owner')->firstOrFail()->permissions;
        $this->assertFalse($saved['candidates']['create']);
        $this->assertTrue($saved['candidates']['edit']);
    }

    public function test_every_backend_module_is_offered_by_the_screen(): void
    {
        // The frontend list is what the screen renders and therefore what a
        // save can carry; drifting from Role::MODULES is what caused this.
        $mock = file_get_contents(base_path('../frontend/src/data/mock.js'));

        $listing = substr(
            $mock,
            strpos($mock, 'export const PERMISSION_MODULES'),
            strpos($mock, 'export const PERMISSION_ACTIONS') - strpos($mock, 'export const PERMISSION_MODULES')
        );

        foreach (Role::MODULES as $module) {
            $this->assertStringContainsString(
                "key: '".$module."'",
                $listing,
                'PERMISSION_MODULES in the frontend is missing "'.$module.'", so saving would revoke it.'
            );
        }
    }
}
