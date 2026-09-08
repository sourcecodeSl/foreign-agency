<?php

namespace App\Support;

use Illuminate\Http\JsonResponse;

/** Every successful response uses this envelope, so the client unwraps once. */
class ApiResponse
{
    public static function ok($data = null, ?string $message = null): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $data,
            'message' => $message,
        ]);
    }

    public static function created($data = null, ?string $message = null): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $data,
            'message' => $message,
        ], 201);
    }
}
