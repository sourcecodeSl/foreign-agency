<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The countries a foreign company may be registered in, as offered on the
 * registration and create-agency screens. The Main Admin and coordinators
 * keep the list; an agency's own country is kept as the text it chose, so
 * taking a country off the list never changes an agency already registered.
 */
return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        Schema::create('countries', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name', 80);
            $table->string('slug', 80)->unique();
            $table->boolean('active')->default(true);
            $table->timestamps();
        });

        DB::table('countries')->insertOrIgnore(array_map(fn (string $name) => [
            'name' => $name,
            'slug' => trim(preg_replace('/[^a-z0-9]+/', '_', strtolower($name)), '_'),
            'active' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ], [
            'Israel',
            'United Arab Emirates',
            'Qatar',
            'Kuwait',
            'Saudi Arabia',
            'Oman',
            'Bahrain',
            'Jordan',
            'Cyprus',
            'Malaysia',
            'Singapore',
            'South Korea',
            'Japan',
            'Sri Lanka',
        ]));
    }

    public function down(): void
    {
        Schema::dropIfExists('countries');
    }
};
