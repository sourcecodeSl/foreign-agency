<?php

namespace Tests\Feature;

use App\Models\Agency;
use App\Models\OtpChallenge;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Forgotten password: the username identifies the account, a code emailed to
 * it proves the person holds that address, and only then is a new password
 * accepted.
 *
 * The auth routes share one throttle counter per IP, so each test keeps its
 * requests well under it.
 */
class PasswordResetTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

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
            'password_hash' => password_hash('OldPassw0rd', PASSWORD_BCRYPT),
            'contact' => 'Nadia Perera',
            'email' => 'owner@skyline.lk',
            'status' => 'active',
        ]);

        $this->owner = User::create([
            'name' => 'Nadia Perera',
            'username' => 'skyline.owner',
            'email' => 'owner@skyline.lk',
            'phone' => '0712000001',
            'password_hash' => password_hash('OldPassw0rd', PASSWORD_BCRYPT),
            'role_slug' => 'agency_owner',
            'agency_name' => 'Skyline Manpower',
            'agency_id' => 'AG-9001',
            'status' => 'active',
        ]);
    }

    /** Step 1, handing back the challenge id with the code that was emailed. */
    private function start(string $username = 'skyline.owner'): array
    {
        $id = $this->postJson('/api/v1/auth/forgot-password', ['username' => $username])
            ->assertOk()
            ->json('data.challengeId');

        return [$id, OtpChallenge::find($id)->code];
    }

    /** Steps 1 and 2, handing back the reset token. */
    private function resetToken(): string
    {
        [$id, $code] = $this->start();

        return $this->postJson('/api/v1/auth/forgot-password/verify', ['challengeId' => $id, 'code' => $code])
            ->assertOk()
            ->json('data.resetToken');
    }

    private function wrongCode(string $code): string
    {
        return $code === '000000' ? '111111' : '000000';
    }

    public function test_the_whole_reset_from_username_to_signing_in(): void
    {
        $response = $this->postJson('/api/v1/auth/forgot-password', ['username' => 'skyline.owner'])
            ->assertOk()
            ->assertJsonPath('data.username', 'skyline.owner')
            // The account's email, identified from the username and masked.
            ->assertJsonPath('data.maskedEmail', 'ow***@skyline.lk');

        $id = $response->json('data.challengeId');
        $challenge = OtpChallenge::find($id);
        $this->assertSame('owner@skyline.lk', $challenge->destination);
        // Email delivery is not configured, so the code comes back to be shown.
        $this->assertSame($challenge->code, $response->json('data.devCode'));

        $this->postJson('/api/v1/auth/forgot-password/verify', [
            'challengeId' => $id,
            'code' => $this->wrongCode($challenge->code),
        ])->assertStatus(400);

        $token = $this->postJson('/api/v1/auth/forgot-password/verify', [
            'challengeId' => $id,
            'code' => $challenge->code,
        ])->assertOk()->json('data.resetToken');

        $this->postJson('/api/v1/auth/forgot-password/reset', [
            'resetToken' => $token,
            'password' => 'NewPassw0rd',
            'passwordConfirmation' => 'NewPassw0rd',
        ])->assertOk()->assertJsonPath('data.username', 'skyline.owner');

        $this->postJson('/api/v1/auth/login', ['username' => 'skyline.owner', 'password' => 'NewPassw0rd'])
            ->assertOk()
            ->assertJsonPath('data.nextStep', 'phone');

        $this->postJson('/api/v1/auth/login', ['username' => 'skyline.owner', 'password' => 'OldPassw0rd'])
            ->assertStatus(401);

        // The copy kept on the agency row moved with it.
        $this->assertTrue(password_verify('NewPassw0rd', Agency::find('AG-9001')->password_hash));
    }

    public function test_the_new_password_is_checked_and_the_token_works_once(): void
    {
        $token = $this->resetToken();

        $this->postJson('/api/v1/auth/forgot-password/reset', [
            'resetToken' => $token,
            'password' => 'weakpass',
            'passwordConfirmation' => 'weakpass',
        ])->assertStatus(422)
            ->assertJsonPath('errors.password', 'Password must include an uppercase letter and a number.');

        $this->postJson('/api/v1/auth/forgot-password/reset', [
            'resetToken' => $token,
            'password' => 'NewPassw0rd',
            'passwordConfirmation' => 'NewPassw0rd!',
        ])->assertStatus(422)
            ->assertJsonPath('errors.passwordConfirmation', 'The passwords do not match.');

        $this->postJson('/api/v1/auth/forgot-password/reset', [
            'resetToken' => $token,
            'password' => 'OldPassw0rd',
            'passwordConfirmation' => 'OldPassw0rd',
        ])->assertStatus(422);

        // None of those spent the token.
        $this->postJson('/api/v1/auth/forgot-password/reset', [
            'resetToken' => $token,
            'password' => 'NewPassw0rd',
            'passwordConfirmation' => 'NewPassw0rd',
        ])->assertOk();

        $this->postJson('/api/v1/auth/forgot-password/reset', [
            'resetToken' => $token,
            'password' => 'OtherPassw0rd',
            'passwordConfirmation' => 'OtherPassw0rd',
        ])->assertStatus(400);

        $this->assertTrue(password_verify('NewPassw0rd', $this->owner->fresh()->password_hash));
    }

    public function test_an_unknown_or_deactivated_account_is_refused(): void
    {
        $this->postJson('/api/v1/auth/forgot-password', ['username' => 'nobody.here'])
            ->assertStatus(404)
            ->assertJsonPath('errors.username', 'No account was found with that username.');

        $this->owner->update(['status' => 'deactivated']);

        $this->postJson('/api/v1/auth/forgot-password', ['username' => 'skyline.owner'])
            ->assertStatus(403);

        $this->assertSame(0, OtpChallenge::count());
    }

    public function test_reset_codes_and_sign_in_codes_never_stand_in_for_each_other(): void
    {
        [$id, $code] = $this->start();

        // A reset code is no sign-in step...
        $this->postJson('/api/v1/auth/verify-otp', ['challengeId' => $id, 'code' => $code])->assertStatus(400);
        $this->postJson('/api/v1/auth/verify-email', ['challengeId' => $id, 'code' => $code])->assertStatus(400);
        $this->postJson('/api/v1/auth/resend-otp', ['challengeId' => $id])->assertStatus(400);

        // ...and none of those used it up.
        $this->postJson('/api/v1/auth/forgot-password/verify', ['challengeId' => $id, 'code' => $code])
            ->assertOk();

        // Nor is a sign-in code a way into the reset.
        $login = $this->postJson('/api/v1/auth/login', ['username' => 'skyline.owner', 'password' => 'OldPassw0rd'])
            ->assertOk()
            ->json('data.challengeId');
        $loginCode = OtpChallenge::find($login)->code;

        $this->postJson('/api/v1/auth/forgot-password/verify', ['challengeId' => $login, 'code' => $loginCode])
            ->assertStatus(400);

        $this->postJson('/api/v1/auth/verify-otp', ['challengeId' => $login, 'code' => $loginCode])
            ->assertOk();
    }
}
