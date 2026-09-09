<?php

namespace App\Exceptions;

use Exception;

/**
 * Error carrying an HTTP status, thrown from controllers and services.
 * Mirrors the Express `ApiError`.
 */
class ApiException extends Exception
{
    public int $status;

    public ?array $errors;

    public function __construct(int $status, string $message, ?array $errors = null)
    {
        parent::__construct($message);
        $this->status = $status;
        $this->errors = $errors;
    }
}
