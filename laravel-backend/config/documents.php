<?php

return [
    // 'local' keeps files in storage/app/private (never web-reachable);
    // set FILESYSTEM_DISK=s3 to push them to a bucket instead.
    'disk' => env('FILESYSTEM_DISK', 'local'),

    'max_kb' => (int) env('DOCUMENTS_MAX_KB', 10240),

    'mimes' => ['pdf', 'jpg', 'jpeg', 'png', 'webp'],
];
