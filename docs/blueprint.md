# faple music — Bot specification

**Archetype:** content

**Voice:** warm and playful — write every user-facing message, button label, error, and empty state in this voice.

A Telegram bot that lets users search for tracks, play streams/previews, and create/manage private playlists. Playback controls are per-user; the bot stores playlists and per-user playback state and notifies the owner/admin of important events.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Music listeners who want quick song search and playback inside Telegram
- Users who want simple personal playlist management without social sharing

## Success criteria

- Users can search and receive up to 8 matching tracks with Play / Preview / Add to Playlist buttons
- Users can create, rename, delete, view, reorder, and play their own playlists; playlists persist across restarts
- Per-user playback controls (Play/Pause/Next/Prev) work and the bot remembers last-played position per playlist
- Admin receives notifications (to ADMIN_CHAT_ID) for new signups and critical errors
- Playlist privacy enforced: one user cannot view or modify another user's private playlists

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open the main menu and welcome card with quick actions
  - outputs: Welcome message, Inline keyboard: Search (ForceReply), My Playlists, Trending, Help
- **Search** (button, actor: user, callback: search:start) — Prompt user to enter a search query using ForceReply
  - inputs: text query via ForceReply
  - outputs: List of up to 8 matching tracks, each with Play, Preview (if available), Add to Playlist buttons
- **My Playlists** (button, actor: user, callback: playlists:list) — Open user's playlist manager (create/rename/delete/view/reorder/play)
  - outputs: List of user's playlists (private) with buttons: Create, Open, Rename, Delete
- **Trending** (button, actor: user, callback: trending:list) — Show currently trending or recommended tracks (owner-configurable source)
  - outputs: List of up to 8 trending tracks with Play / Add to Playlist / Preview
- **/help** (command, actor: user, command: /help) — Show short usage help and available commands
  - outputs: Short help text and links to main menu actions

## Flows

### Search and result actions
_Trigger:_ search:start (callback) -> ForceReply text

1. Bot prompts user to type query (ForceReply)
2. User types query
3. Bot queries track resolver, returns up to 8 matches (metadata + playable link/preview availability)
4. Bot posts results as cards with Play, Preview, Add to Playlist buttons
5. User taps Play -> PlayTrack flow; taps Add -> Playlist selection modal; taps Preview -> 30s preview or unavailable message

_Data touched:_ Track, User

### PlayTrack (per-user playback)
_Trigger:_ Play button callback for a track

1. Bot sends inline player card with track title, artist, Play/Pause, Next, Prev, Add to Playlist
2. Bot records playback state: user_id, current_track_id, position_seconds (starts at 0), playlist context if any
3. User controls playback via callbacks (Play/Pause/Next/Prev) and bot updates playback state
4. If playing from a playlist, Next/Prev traverse playlist; bot persists last-played index for that playlist

_Data touched:_ PlaybackState, Track, Playlist, User

### Playlist management
_Trigger:_ playlists:list or Add to Playlist -> create/select

1. List user's playlists with buttons: Create New, Open (view contents), Rename, Delete
2. Create: prompt for name (ForceReply), create playlist record (private by default)
3. Open: show ordered track list with Play All, Play track, Move Up / Move Down, Remove
4. Rename/Delete: confirm via inline yes/no; perform action and notify user
5. Reorder: Move Up/Down buttons update playlist ordering in DB and refresh view

_Data touched:_ Playlist, Track, PlaybackState

### Preview handling
_Trigger:_ Preview button callback

1. If preview URL available, play a 30s preview clip using the same inline player card
2. If preview unavailable, show friendly message and suggest full Play or Add to Playlist

_Data touched:_ Track, User

### Admin notifications
_Trigger:_ new user registration / critical error / link expired / high error rate

1. Bot posts a concise notification to ADMIN_CHAT_ID with context and action links
2. Notifications include: new user signup (optional), system errors, expired streaming links, and requests for owner attention

_Data touched:_ User, System logs

## Owner-supplied settings

The OWNER provides these; they are collected in chat and injected into the environment at deploy. Read each one from the environment where it is used (`ctx.env.<KEY>` / `env.<KEY>` on Cloudflare Workers; `process.env.<KEY>` only as a Node/harness fallback — never the sole read). Do NOT invent your own way of learning the value, do NOT ask for it in a bot message, and do NOT hardcode a default.

- **ADMIN_CHAT_ID** — Telegram chat id where admin notifications and errors are sent
  - this is the OWNER's own chat id; the platform already knows it. Read `ADMIN_CHAT_ID` via `ctx.env` (prefer toolkit `adminChatId` / `requireOwner`) — never ask a user, never treat whoever writes first as the admin, never invent claim-admin or open manage for everyone.
  - may be UNSET at runtime: the bot must still start, and the feature needing ADMIN_CHAT_ID must say so plainly instead of failing.

Your behavioral specs run WITHOUT these values, so no spec may depend on one.

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

An entity that merely NAMES an owner-supplied setting above (an admin chat, an API account) is not something to store or discover — read it from the environment.

- **User** _(retention: persistent)_ — Telegram user account and preferences
  - fields: user_id (telegram id), display_name, username, lang, created_at, preferences (e.g., preferred preview behavior)
- **Track** _(retention: persistent)_ — Metadata for a searchable track and playable link(s)
  - fields: track_id (internal), title, artist, duration_seconds, source_link (playable stream URL or resolver id), preview_link (if available), license_flags (preview_allowed, direct_play_allowed), cached_at (for link expiry awareness)
- **Playlist** _(retention: persistent)_ — User-owned ordered list of track references
  - fields: playlist_id, owner_user_id, name, ordered_track_ids, created_at, updated_at, is_private
- **PlaybackState** _(retention: persistent)_ — Per-user current playback context and last-played position per playlist
  - fields: user_id, context_type (track | playlist), context_id (track_id or playlist_id), current_track_id, position_seconds, is_playing, updated_at

## Integrations

- **Telegram** (required) — Bot API messaging, inline keyboards, callbacks, ForceReply
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Set / update ADMIN_CHAT_ID (owner/admin for notifications)
- Upload bot avatar image (owner supplied) to replace placeholder
- Configure or refresh trending source (if supported)
- Request export of user data or individual user's playlists
- Purge expired cached track links
- Adjust search result cap (default 8) and preview length (default 30s)

## Notifications

- User-facing: Playback started/paused/resumed, Playlist created/renamed/deleted, Preview unavailable, No search results found
- Owner-facing (to ADMIN_CHAT_ID): critical system errors, expired streaming links affecting multiple users, optionally new user signup notifications or high error rates

## Permissions & privacy

- Playlists are private by default and visible only to their owner; no social sharing unless owner requests the feature later
- Bot does not host copyrighted audio; it supplies links/streams from permitted sources and previews only when allowed
- Bot accesses basic Telegram profile metadata (display name, username) for user records
- Users can request export or deletion of their data (playlists and playback state) via an owner-provided data-export/delete flow

## Edge cases

- Search returns zero results — show friendly fallback with suggestions and Trending
- Track source link expired or 403/404 on play — notify user, mark track as stale, and notify admin if many failures
- Preview not available — button shows 'Preview unavailable' state
- Reorder boundary conditions (move up at top, move down at bottom) — disable the respective button
- Simultaneous playlist edits from multiple sessions — last-write-wins with optimistic UI and conflict warning
- Large playlists — enforce a sensible max (missing field) and paginate display
- Network or streaming latency causing playback interruptions — show retry and offline messages

## Required tests

- Dialog-level acceptance: Search -> returns <=8 results with Play/Preview/Add buttons
- Dialog-level acceptance: Play from search -> shows inline player card and Play/Pause/Next/Prev callbacks update PlaybackState
- Dialog-level acceptance: Create/Rename/Delete playlist and verify persistence and privacy
- Dialog-level acceptance: Add track to playlist, open playlist, reorder with Move Up/Down and verify ordering persisted
- Persistence test: Playback state and playlist contents survive service restart
- Privacy test: One user cannot view or modify another user's playlists
- Admin notification test: errors and bulk link expiry are posted to ADMIN_CHAT_ID

## Assumptions

- Owner will provide ADMIN_CHAT_ID so the bot can send admin notifications
- Bot will supply playable links/streams from permitted public sources; resolver details are not provided in the brief
- Previews are limited to ~30s when available from source metadata
- No paid features or premium gating are required initially
- Default playlist privacy is private and owner will request changes if social sharing is desired later
