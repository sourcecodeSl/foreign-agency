<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One message in the conversation between the admin side and one agency.
 *
 * `sender_side` is admin or agency. A deleted message keeps its row, so the
 * conversation still shows where it was; its text and file are gone.
 */
class Message extends Model
{
    protected $table = 'messages';

    protected $guarded = [];

    protected $casts = [
        'sender_id' => 'integer',
        'reply_to_id' => 'integer',
        'forwarded' => 'boolean',
        'attachment_size' => 'integer',
        'edited_at' => 'datetime',
        'deleted_at' => 'datetime',
        'delivered_at' => 'datetime',
        'read_at' => 'datetime',
    ];

    public const ADMIN = 'admin';

    public const AGENCY = 'agency';

    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sender_id');
    }

    public function replyTo(): BelongsTo
    {
        return $this->belongsTo(self::class, 'reply_to_id');
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class, 'agency_id');
    }

    /** sent, delivered or read - the ticks under a message its own side sent. */
    public function status(): string
    {
        if ($this->read_at) {
            return 'read';
        }

        return $this->delivered_at ? 'delivered' : 'sent';
    }

    /** The line a conversation list or a notification shows for it. */
    public function preview(): string
    {
        if ($this->deleted_at) {
            return 'This message was deleted';
        }

        $text = trim((string) $this->body);
        if ($text === '' && $this->attachment_name) {
            return '📎 '.$this->attachment_name;
        }

        return mb_strimwidth($text, 0, 90, '…');
    }

    /**
     * The shape the chat screen renders, from one side's point of view.
     * `outgoing` is written from the viewer's own side; `canChange` only by
     * the viewer themselves.
     */
    public function toPublic(string $viewerSide, ?int $viewerId): array
    {
        $deleted = (bool) $this->deleted_at;
        $outgoing = $this->sender_side === $viewerSide;

        return [
            'id' => $this->id,
            'conversationId' => $this->agency_id,
            'side' => $this->sender_side,
            'outgoing' => $outgoing,
            'senderName' => $this->senderName($viewerSide),
            'body' => $deleted ? null : $this->body,
            'attachment' => ! $deleted && $this->attachment_path ? [
                'name' => $this->attachment_name,
                'mime' => $this->attachment_mime,
                'size' => $this->attachment_size,
                'isImage' => str_starts_with((string) $this->attachment_mime, 'image/'),
            ] : null,
            'replyTo' => $this->reply_to_id && $this->replyTo ? [
                'id' => $this->replyTo->id,
                'outgoing' => $this->replyTo->sender_side === $viewerSide,
                'senderName' => $this->replyTo->senderName($viewerSide),
                'preview' => $this->replyTo->preview(),
            ] : null,
            'forwarded' => $this->forwarded,
            'edited' => (bool) $this->edited_at && ! $deleted,
            'deleted' => $deleted,
            'canChange' => ! $deleted && $viewerId !== null && $this->sender_id === $viewerId,
            'status' => $outgoing ? $this->status() : null,
            'createdAt' => $this->created_at?->toIso8601String(),
            'updatedAt' => $this->updated_at?->toIso8601String(),
        ];
    }

    /**
     * An agency reads everything from the admin side as "Admin"; the admin
     * side sees which of them wrote it, and who at the agency did.
     */
    private function senderName(string $viewerSide): string
    {
        if ($this->sender_side === self::ADMIN && $viewerSide !== self::ADMIN) {
            return 'Admin';
        }

        return $this->sender?->name ?? ($this->sender_side === self::ADMIN ? 'Admin' : 'Agency');
    }
}
