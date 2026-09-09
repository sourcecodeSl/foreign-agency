<?php

return [
    // How long a code stays valid.
    'ttl_seconds' => (int) env('OTP_TTL_SECONDS', 300),

    // Matches the 59-second countdown shown in the UI.
    'resend_cooldown' => (int) env('OTP_RESEND_COOLDOWN', 59),

    'length' => (int) env('OTP_LENGTH', 6),

    'max_attempts' => (int) env('OTP_MAX_ATTEMPTS', 5),

    /*
     * Roles that must clear phone + email OTP before a token is issued.
     * The spec requires this for agencies; Main Admin is included as well
     * because it is the most privileged account. Drop it from the list to
     * let admins sign in with a password only.
     */
    'required_roles' => array_filter(explode(',', (string) env('OTP_REQUIRED_ROLES', 'main_admin,agency'))),

    /*
     * Echo the code in the API response while SMS/mail delivery is not
     * configured, so the flow is testable. Forced off when the app is in
     * production.
     */
    'expose_code' => (bool) env('OTP_EXPOSE_CODE', true),
];
