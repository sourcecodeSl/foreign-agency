<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Notifications the person has opened, so the bell stops listing them.
 *
 * The bell's items are built from other records, not stored, so this only
 * keeps which item ids each login has dealt with. An item whose state moves
 * on (a different result, fewer missing documents) gets a new id and shows
 * again.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notification_dismissals', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('user_id');
            $table->string('notification_id', 120);
            $table->timestamp('created_at')->nullable();

            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->unique(['user_id', 'notification_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notification_dismissals');
    }
};
