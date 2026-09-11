<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\Http;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Tests must never reach a real gateway, whatever the local .env holds.
        // With the SMS keys cleared, codes come back on screen the way the
        // tests expect, and any HTTP call that is not faked throws instead of
        // going out - one run once texted real numbers from a live account.
        config([
            'services.ozonesender.user_id' => null,
            'services.ozonesender.api_key' => null,
            'services.ozonesender.sender_id' => null,
        ]);

        Http::preventStrayRequests();
    }
}
