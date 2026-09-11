<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Sign-in is rate limited per step. Running out of attempts on one step tells
 * the person how long to wait, and does not lock them out of the others.
 */
class SignInRateLimitTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    private function failedLogin()
    {
        return $this->postJson('/api/v1/auth/login', ['username' => 'nobody.here', 'password' => 'wrongpass1']);
    }

    public function test_the_limit_says_how_long_to_wait(): void
    {
        for ($i = 0; $i < 10; $i++) {
            $this->failedLogin()->assertStatus(401);
        }

        $blocked = $this->failedLogin()->assertStatus(429);

        $this->assertStringContainsString('Please wait', $blocked->json('message'));
        $this->assertGreaterThan(0, $blocked->json('retryAfter'));
        $this->assertTrue($blocked->headers->has('Retry-After'));
    }

    public function test_using_up_one_step_does_not_block_the_others(): void
    {
        for ($i = 0; $i < 10; $i++) {
            $this->failedLogin()->assertStatus(401);
        }
        $this->failedLogin()->assertStatus(429);

        // Before, every sign-in step shared one count, so these were refused too.
        $this->postJson('/api/v1/auth/forgot-password', ['username' => 'nobody.here'])->assertStatus(404);
        $this->postJson('/api/v1/auth/verify-otp', ['challengeId' => 'chg_missing', 'code' => '123456'])->assertStatus(400);
    }
}
