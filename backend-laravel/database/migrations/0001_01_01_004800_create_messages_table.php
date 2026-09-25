<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Messages between the admin side and one agency or foreign company.
 *
 * There is one conversation per agency, keyed by agency_id: whoever signs in
 * under that agency reads it, and the Main Admin and coordinators share the
 * admin side of every one. Agencies never write to each other, so there is
 * nothing to key on but the agency.
 *
 * delivered_at and read_at belong to the side the message went to: the first
 * time anyone there loads their messages, and the first time anyone there
 * opens this conversation.
 *
 * users.last_seen_at is what "online" and "last seen" are read from.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('messages', function (Blueprint $table) {
            $table->increments('id');
            $table->string('agency_id', 20);
            // admin | agency - which end of the conversation wrote it.
            $table->string('sender_side', 10);
            $table->unsignedInteger('sender_id')->nullable();
            $table->text('body')->nullable();
            $table->string('attachment_path', 255)->nullable();
            $table->string('attachment_name', 190)->nullable();
            $table->string('attachment_mime', 120)->nullable();
            $table->unsignedInteger('attachment_size')->nullable();
            $table->unsignedInteger('reply_to_id')->nullable();
            $table->boolean('forwarded')->default(false);
            $table->timestamp('edited_at')->nullable();
            $table->timestamp('deleted_at')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->timestamp('read_at')->nullable();
            $table->timestamps();

            $table->foreign('agency_id')->references('id')->on('agencies')->cascadeOnDelete();
            $table->foreign('sender_id')->references('id')->on('users')->nullOnDelete();
            $table->index(['agency_id', 'id']);
            $table->index(['agency_id', 'sender_side', 'read_at']);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('last_seen_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('messages');

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('last_seen_at');
        });
    }
};
