<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Models\Agency;
use App\Models\Message;
use App\Support\ApiResponse;
use App\Support\PageAccess;
use App\Support\Presence;
use Carbon\Carbon;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Messages: a chat between the admin side and each agency, one at a time.
 *
 *   admin   the Main Admin, and a coordinator the messages page is opened
 *           to. Share the admin end of every conversation: talk to any
 *           foreign company or local agency, and forward what one sent to
 *           others.
 *   agency  anyone signed in under a foreign company or a local agency. Has
 *           exactly one conversation - its own, with the admin side - and
 *           never sees any other agency's, nor where a forwarded message
 *           came from.
 *
 * The auditor only reads records and has no conversations.
 *
 * Nothing is pushed: the screen asks again every few seconds, passing back
 * the `cursor` it was given, and gets whatever changed since - new messages,
 * edits, deletions and ticks alike.
 */
class MessageController extends Controller
{
    private const MAX_BODY = 4000;

    /** Messages per page when a conversation opens or scrolls back. */
    private const PAGE = 60;

    /** Seconds "typing..." lasts after the last key press. */
    private const TYPING_SECONDS = 6;

    private const DISK = 'local';

    /** Who is asking, as [side, own agency id or null, user id]. */
    private function viewer(Request $request): array
    {
        $auth = $request->attributes->get('auth_user');
        $role = $auth['roleSlug'] ?? null;
        $userId = isset($auth['sub']) ? (int) $auth['sub'] : null;

        // can.page on the routes already holds a coordinator to the page.
        if (in_array($role, ['main_admin', PageAccess::ROLE], true)) {
            return [Message::ADMIN, null, $userId];
        }

        $agencyId = $request->attributes->get('auth_account')?->agency_id;
        if (! $agencyId) {
            throw new ApiException(403, 'Messages are between the admin and the agencies.');
        }

        return [Message::AGENCY, (string) $agencyId, $userId];
    }

    private function requireAdmin(Request $request): void
    {
        if ($this->viewer($request)[0] !== Message::ADMIN) {
            throw new ApiException(403, 'Only the admin side does that.');
        }
    }

    /**
     * The conversation asked for, if this viewer may be in it. An agency
     * asking for anyone else's is answered as not found.
     */
    private function conversation(Request $request, string $agencyId): array
    {
        [$side, $own, $userId] = $this->viewer($request);

        if ($side === Message::AGENCY && $agencyId !== $own) {
            throw new ApiException(404, 'That conversation was not found.');
        }

        $agency = Agency::find($agencyId);
        if (! $agency) {
            throw new ApiException(404, 'That conversation was not found.');
        }

        return [$side, $agency, $userId];
    }

    private function storage(): FilesystemAdapter
    {
        /** @var FilesystemAdapter */
        return Storage::disk(self::DISK);
    }

    /** The side a message from this side goes to. */
    private static function other(string $side): string
    {
        return $side === Message::ADMIN ? Message::AGENCY : Message::ADMIN;
    }

    /**
     * Everything written to this side and not yet delivered counts as
     * delivered now: somebody on this side has the system open.
     */
    private function markDelivered(string $side, ?string $agencyId): void
    {
        Message::query()
            ->where('sender_side', self::other($side))
            ->whereNull('delivered_at')
            ->when($agencyId, fn ($q) => $q->where('agency_id', $agencyId))
            ->update(['delivered_at' => now(), 'updated_at' => now()]);
    }

    /** Written to this side in one conversation, and not opened yet. */
    private function unreadQuery(string $side)
    {
        return Message::query()
            ->where('sender_side', self::other($side))
            ->whereNull('read_at')
            ->whereNull('deleted_at');
    }

    private function agencyShape(Agency $agency): array
    {
        return [
            'id' => $agency->id,
            'name' => $agency->name,
            'code' => $agency->code,
            'type' => ($agency->type ?? 'local') === 'foreign' ? 'foreign' : 'local',
            'country' => $agency->country ?? (($agency->type ?? 'local') === 'local' ? 'Sri Lanka' : null),
        ];
    }

    private function typingKey(string $agencyId, string $side): string
    {
        return 'messages.typing.'.$agencyId.'.'.$side;
    }

    /**
     * GET /messages/conversations - the admin side's list: every active
     * foreign company and local agency, the latest message with each, how
     * many are unread, and whether anyone there is online. The screen sorts
     * them into companies and agencies and filters by country itself.
     */
    public function conversations(Request $request)
    {
        $this->requireAdmin($request);
        $this->markDelivered(Message::ADMIN, null);

        $agencies = Agency::where('status', 'active')->orderBy('name')->get();

        $latest = Message::whereIn('id', Message::selectRaw('MAX(id)')->groupBy('agency_id'))
            ->get()->keyBy('agency_id');

        $unread = $this->unreadQuery(Message::ADMIN)
            ->selectRaw('agency_id, COUNT(*) as total')
            ->groupBy('agency_id')
            ->pluck('total', 'agency_id');

        $seen = Presence::agencies();

        $list = $agencies->map(function (Agency $agency) use ($latest, $unread, $seen) {
            $last = $latest[$agency->id] ?? null;

            return $this->agencyShape($agency) + [
                'unread' => (int) ($unread[$agency->id] ?? 0),
                'lastMessage' => $last ? [
                    'preview' => $last->preview(),
                    'outgoing' => $last->sender_side === Message::ADMIN,
                    'status' => $last->sender_side === Message::ADMIN ? $last->status() : null,
                    'deleted' => (bool) $last->deleted_at,
                    'at' => $last->created_at?->toIso8601String(),
                ] : null,
                'typing' => Cache::has($this->typingKey($agency->id, Message::AGENCY)),
            ] + Presence::of($seen[$agency->id] ?? null);
        })->values();

        return ApiResponse::ok($list);
    }

    /**
     * GET /messages/unread - for the menu badge on every screen: how many
     * messages wait for this viewer, across how many conversations. Reading
     * it also marks what was sent to this side as delivered.
     */
    public function unread(Request $request)
    {
        [$side, $own] = $this->viewer($request);
        $this->markDelivered($side, $own);

        $rows = $this->unreadQuery($side)
            ->when($own, fn ($q) => $q->where('agency_id', $own))
            ->selectRaw('agency_id, COUNT(*) as total')
            ->groupBy('agency_id')
            ->pluck('total');

        return ApiResponse::ok([
            'total' => (int) $rows->sum(),
            'conversations' => $rows->count(),
        ]);
    }

    /**
     * GET /messages/{agencyId} - one conversation. With `before`, the page
     * of older messages; with `cursor`, only what changed since the last
     * call. Opening it marks everything the other side sent as read.
     */
    public function show(Request $request, string $agencyId)
    {
        [$side, $agency, $userId] = $this->conversation($request, $agencyId);

        $now = now();
        $this->unreadQuery($side)->where('agency_id', $agency->id)
            ->update(['read_at' => $now, 'delivered_at' => $now, 'updated_at' => $now]);

        $query = Message::where('agency_id', $agency->id)->with(['sender', 'replyTo.sender']);
        $cursor = $request->query('cursor');
        $hasMore = false;

        if ($cursor) {
            // A second either way: timestamps hold whole seconds, and the
            // screen merges by id, so seeing one twice is harmless.
            $since = Carbon::parse((string) $cursor)->subSeconds(2);
            $messages = $query->where('updated_at', '>=', $since)->orderBy('id')->get();
        } else {
            if ($request->filled('before')) {
                $query->where('id', '<', (int) $request->query('before'));
            }
            $messages = $query->orderByDesc('id')->limit(self::PAGE + 1)->get();
            $hasMore = $messages->count() > self::PAGE;
            $messages = $messages->take(self::PAGE)->reverse()->values();
        }

        $presence = $side === Message::ADMIN
            ? Presence::of(Presence::agencies()[$agency->id] ?? null)
            : Presence::adminSide();

        return ApiResponse::ok([
            'conversation' => ($side === Message::ADMIN
                ? $this->agencyShape($agency)
                : ['id' => $agency->id, 'name' => 'Admin', 'type' => 'admin']) + $presence + [
                    'typing' => Cache::has($this->typingKey($agency->id, self::other($side))),
                ],
            'messages' => $messages->map(fn (Message $m) => $m->toPublic($side, $userId))->values(),
            'hasMore' => $hasMore,
            'cursor' => $now->toIso8601String(),
        ]);
    }

    /**
     * POST /messages/{agencyId} - text, a file, or both; optionally in
     * reply to an earlier message in the same conversation.
     */
    public function store(Request $request, string $agencyId)
    {
        [$side, $agency, $userId] = $this->conversation($request, $agencyId);

        $data = $request->validate([
            'body' => ['nullable', 'string', 'max:'.self::MAX_BODY],
            'file' => ['nullable', 'file', 'max:10240',
                'mimes:jpg,jpeg,png,gif,webp,pdf,doc,docx,xls,xlsx,csv,txt,zip'],
            'replyToId' => ['nullable', 'integer'],
        ]);

        $body = trim((string) ($data['body'] ?? ''));
        $file = $request->file('file');

        if ($body === '' && ! $file) {
            throw new ApiException(422, 'Type a message or attach a file.');
        }

        $replyTo = null;
        if (! empty($data['replyToId'])) {
            $replyTo = Message::where('agency_id', $agency->id)->find($data['replyToId']);
            if (! $replyTo) {
                throw new ApiException(422, 'The message you replied to is not in this conversation.');
            }
        }

        $message = Message::create([
            'agency_id' => $agency->id,
            'sender_side' => $side,
            'sender_id' => $userId,
            'body' => $body === '' ? null : $body,
            'reply_to_id' => $replyTo?->id,
        ] + ($file ? $this->saveFile($file) : []));

        Cache::forget($this->typingKey($agency->id, $side));

        return ApiResponse::created($message->load(['sender', 'replyTo.sender'])->toPublic($side, $userId));
    }

    private function saveFile($file): array
    {
        $path = $file->storeAs('messages', Str::uuid().'.'.$file->getClientOriginalExtension(), self::DISK);

        return [
            'attachment_path' => $path,
            'attachment_name' => mb_substr($file->getClientOriginalName(), 0, 190),
            'attachment_mime' => $file->getMimeType(),
            'attachment_size' => $file->getSize(),
        ];
    }

    /** A message in this conversation that the viewer wrote themselves. */
    private function ownMessage(Request $request, string $agencyId, string $messageId): array
    {
        [$side, $agency, $userId] = $this->conversation($request, $agencyId);

        $message = Message::where('agency_id', $agency->id)->find($messageId);
        if (! $message) {
            throw new ApiException(404, 'That message was not found.');
        }
        if ($message->deleted_at) {
            throw new ApiException(422, 'That message was deleted.');
        }
        if ($message->sender_id !== $userId || $message->sender_side !== $side) {
            throw new ApiException(403, 'Only the person who sent a message can change it.');
        }

        return [$side, $message, $userId];
    }

    /** PATCH /messages/{agencyId}/{messageId} - corrects the text. */
    public function update(Request $request, string $agencyId, string $messageId)
    {
        [$side, $message, $userId] = $this->ownMessage($request, $agencyId, $messageId);

        $data = $request->validate([
            'body' => ['required', 'string', 'max:'.self::MAX_BODY],
        ]);
        $body = trim($data['body']);

        if ($body === '') {
            throw new ApiException(422, 'A message cannot be left empty. Delete it instead.');
        }

        if ($body !== $message->body) {
            $message->update(['body' => $body, 'edited_at' => now()]);
        }

        return ApiResponse::ok($message->load(['sender', 'replyTo.sender'])->toPublic($side, $userId));
    }

    /**
     * DELETE /messages/{agencyId}/{messageId} - deleted for everyone. The
     * row stays, so the conversation shows a message was there.
     */
    public function destroy(Request $request, string $agencyId, string $messageId)
    {
        [$side, $message, $userId] = $this->ownMessage($request, $agencyId, $messageId);

        $this->removeFile($message);
        $message->update([
            'body' => null,
            'attachment_path' => null,
            'attachment_name' => null,
            'attachment_mime' => null,
            'attachment_size' => null,
            'deleted_at' => now(),
        ]);

        return ApiResponse::ok($message->load(['sender', 'replyTo.sender'])->toPublic($side, $userId), 'Message deleted.');
    }

    private function removeFile(Message $message): void
    {
        // A forwarded copy has a file of its own, so no other message loses it.
        if ($message->attachment_path) {
            $this->storage()->delete($message->attachment_path);
        }
    }

    /**
     * POST /messages/{agencyId}/{messageId}/forward - the admin side sends
     * a copy on to other agencies or companies. The copy says it was
     * forwarded but not where from, so one company never learns of another.
     */
    public function forward(Request $request, string $agencyId, string $messageId)
    {
        $this->requireAdmin($request);
        [, $agency, $userId] = $this->conversation($request, $agencyId);

        $data = $request->validate([
            'to' => ['required', 'array', 'min:1', 'max:200'],
            'to.*' => ['string', 'max:20'],
        ]);

        $message = Message::where('agency_id', $agency->id)->find($messageId);
        if (! $message || $message->deleted_at) {
            throw new ApiException(404, 'That message was not found.');
        }

        $targets = Agency::whereIn('id', array_unique($data['to']))
            ->where('status', 'active')
            ->where('id', '!=', $agency->id)
            ->pluck('id');

        if ($targets->isEmpty()) {
            throw new ApiException(422, 'Choose at least one other agency or company to forward to.');
        }

        foreach ($targets as $target) {
            Message::create([
                'agency_id' => $target,
                'sender_side' => Message::ADMIN,
                'sender_id' => $userId,
                'body' => $message->body,
                'forwarded' => true,
            ] + $this->copyFile($message));
        }

        $count = $targets->count();

        return ApiResponse::ok(['forwarded' => $count],
            'Forwarded to '.$count.' '.($count === 1 ? 'conversation' : 'conversations').'.');
    }

    private function copyFile(Message $message): array
    {
        if (! $message->attachment_path || ! $this->storage()->exists($message->attachment_path)) {
            return [];
        }

        $copy = 'messages/'.Str::uuid().'.'.pathinfo($message->attachment_path, PATHINFO_EXTENSION);
        $this->storage()->copy($message->attachment_path, $copy);

        return [
            'attachment_path' => $copy,
            'attachment_name' => $message->attachment_name,
            'attachment_mime' => $message->attachment_mime,
            'attachment_size' => $message->attachment_size,
        ];
    }

    /** GET /messages/{agencyId}/{messageId}/file - the attached file. */
    public function file(Request $request, string $agencyId, string $messageId)
    {
        [, $agency] = $this->conversation($request, $agencyId);

        $message = Message::where('agency_id', $agency->id)->find($messageId);
        if (! $message || $message->deleted_at || ! $message->attachment_path
            || ! $this->storage()->exists($message->attachment_path)) {
            throw new ApiException(404, 'That file was not found.');
        }

        return $this->storage()->response($message->attachment_path, $message->attachment_name, [
            'Content-Type' => $message->attachment_mime ?: 'application/octet-stream',
        ]);
    }

    /** POST /messages/{agencyId}/typing - shows "typing..." at the other end for a few seconds. */
    public function typing(Request $request, string $agencyId)
    {
        [$side, $agency] = $this->conversation($request, $agencyId);

        Cache::put($this->typingKey($agency->id, $side), true, self::TYPING_SECONDS);

        return ApiResponse::ok(null);
    }
}
