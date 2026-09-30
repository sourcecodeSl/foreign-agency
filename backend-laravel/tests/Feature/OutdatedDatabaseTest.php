<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\Jwt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * New code on a live database that has not had its update yet: the screens
 * say which table or column is missing and where to run the update, rather
 * than "Something went wrong on our side".
 */
class OutdatedDatabaseTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_missing_table_is_named_with_the_way_to_update(): void
    {
        $this->seed();
        Schema::drop('messages');

        $this->withToken(Jwt::sign(User::where('role_slug', 'main_admin')->first()->toPublic()))
            ->getJson('/api/v1/messages/unread')
            ->assertStatus(500)
            ->assertJsonPath('message', 'The database is not up to date (missing table messages). '
                .'Open /api/v1/system/update and run the waiting updates.');
    }
}
