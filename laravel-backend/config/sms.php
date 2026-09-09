<?php

return [
    // 'log' writes the code to the Laravel log; swap for a real gateway.
    'driver' => env('SMS_DRIVER', 'log'),

    // Local numbers are normalised to E.164 with this code: 0781311850 -> +94781311850
    'country_code' => env('SMS_COUNTRY_CODE', '94'),

    'from' => env('SMS_FROM'),

    'twilio' => [
        'sid' => env('TWILIO_SID'),
        'token' => env('TWILIO_TOKEN'),
    ],
];
