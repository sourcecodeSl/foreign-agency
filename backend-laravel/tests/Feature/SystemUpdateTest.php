<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * /system/update runs pending migrations from a browser, for a live server
 * where php artisan cannot be run. It is off unless a long key is set, and
 * lists what is waiting before running anything.
 */
class SystemUpdateTest extends TestCase
{
    use DatabaseMigrations;

    private const KEY = 'a-long-secret-key-for-the-update-page-0001';

    private const URL = '/api/v1/system/update';

    public function test_the_page_does_not_exist_without_a_long_key(): void
    {
        config(['app.migrate_key' => null]);
        $this->get(self::URL)->assertNotFound();
        $this->post(self::URL, ['key' => '', 'action' => 'run'])->assertNotFound();

        // A short key does not switch it on either.
        config(['app.migrate_key' => 'short']);
        $this->get(self::URL)->assertNotFound();
        $this->post(self::URL, ['key' => 'short', 'action' => 'run'])->assertNotFound();
    }

    public function test_a_wrong_key_runs_nothing(): void
    {
        config(['app.migrate_key' => self::KEY]);

        // The key is asked for on the page, never taken from the address.
        $this->get(self::URL.'?key='.self::KEY)->assertOk()
            ->assertSee('Update key')
            ->assertDontSee('waiting to run');

        $this->post(self::URL, ['key' => 'not-the-key', 'action' => 'run'])
            ->assertForbidden()
            ->assertSee('That key is not right.');
    }

    public function test_it_lists_what_is_waiting_and_runs_it_on_request(): void
    {
        config(['app.migrate_key' => self::KEY]);

        $this->post(self::URL, ['key' => self::KEY, 'action' => 'check'])
            ->assertOk()
            ->assertSee('The database is up to date.');

        // The last update undone, as on a server that has not had it yet.
        Artisan::call('migrate:rollback', ['--step' => 1, '--force' => true]);
        $this->assertFalse(Schema::hasColumn('users', 'appearance'));

        // Checking lists it and changes nothing.
        $this->post(self::URL, ['key' => self::KEY, 'action' => 'check'])
            ->assertOk()
            ->assertSee('1 update is waiting to run:')
            ->assertSee('0001_01_01_004200_add_appearance_to_users_table')
            ->assertSee('Run update');
        $this->assertFalse(Schema::hasColumn('users', 'appearance'));

        // Running it brings the database up to date.
        $this->post(self::URL, ['key' => self::KEY, 'action' => 'run'])
            ->assertOk()
            ->assertSee('Done. 1 update ran, and the database is up to date.');
        $this->assertTrue(Schema::hasColumn('users', 'appearance'));

        // Running again is harmless.
        $this->post(self::URL, ['key' => self::KEY, 'action' => 'run'])
            ->assertOk()
            ->assertSee('Done. 0 updates ran');
    }
}
