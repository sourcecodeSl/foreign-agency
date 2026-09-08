<?php

use Illuminate\Support\Facades\Route;

/*
| The React single-page app is built into public/ (index.html + assets/).
| Apache/Laravel serves the real files directly; every other path falls back
| to index.html so React Router can handle client-side routes like /login.
*/
Route::get('/{any?}', function () {
    $index = public_path('index.html');
    abort_unless(file_exists($index), 404);

    return response()->file($index);
})->where('any', '^(?!api/).*$');
