import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { now, readDomain, savePlayback, type Playback, type Track } from "../domain.js";

const composer = new Composer<Ctx>();
const user = (ctx: Ctx) => ctx.from?.id ?? ctx.chat?.id ?? 0;

function playerKeyboard(track: Track, playing: boolean, playlist?: string) {
  return inlineKeyboard([
    [inlineButton(playing ? "⏸ Pause" : "▶️ Play", `player:toggle:${track.id}${playlist ? `:${playlist}` : ""}`)],
    [inlineButton("⏮ Prev", `player:prev:${playlist ?? track.id}`), inlineButton("⏭ Next", `player:next:${playlist ?? track.id}`)],
    [inlineButton("➕ Add to playlist", `add:${track.id}`)],
  ]);
}

async function show(ctx: Ctx, track: Track, state: Playback, edit = false): Promise<void> {
  const text = `${state.playing ? "▶️ Playing" : "⏸ Paused"}: ${track.title} — ${track.artist}`;
  const opts = { reply_markup: playerKeyboard(track, state.playing, state.context === "playlist" ? state.contextId : undefined) };
  if (edit) await ctx.editMessageText(text, opts); else await ctx.reply(text, opts);
}

async function start(ctx: Ctx, id: string, playlist?: string): Promise<void> {
  const d = await readDomain(ctx); const track = d.tracks[id];
  if (!track) { await ctx.reply("That track has expired. Search for it again and I’ll find a fresh link."); return; }
  const state: Playback = { user: user(ctx), context: playlist ? "playlist" : "track", contextId: playlist ?? id, track: id, position: 0, playing: true, updatedAt: now() };
  await savePlayback(ctx, state); await show(ctx, track, state);
}

composer.callbackQuery(/^play:([^:]+)(?::pl:(.+))?$/, async (ctx) => { await ctx.answerCallbackQuery(); await start(ctx, ctx.match[1], ctx.match[2]); });
composer.callbackQuery(/^player:toggle:([^:]+)(?::(.+))?$/, async (ctx) => { const d = await readDomain(ctx); const track = d.tracks[ctx.match[1]]; if (!track) { await ctx.answerCallbackQuery({ text: "That link has expired." }); await ctx.reply("That track has expired. Search for it again and I’ll find a fresh link."); return; } const old = d.playback[String(user(ctx))]; const state: Playback = { user: user(ctx), context: ctx.match[2] ? "playlist" : "track", contextId: ctx.match[2] ?? track.id, track: track.id, position: old?.position ?? 0, playing: !(old?.playing ?? false), updatedAt: now() }; await savePlayback(ctx, state); await ctx.answerCallbackQuery(); await show(ctx, track, state, true); });
composer.callbackQuery(/^player:(next|prev):(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); const d = await readDomain(ctx); const old = d.playback[String(user(ctx))]; if (!old) { await ctx.reply("Start a track first and I’ll keep your place."); return; } if (old.context === "playlist") { const p = d.playlists[old.contextId]; if (p) { const at = p.tracks.indexOf(old.track); const next = at + (ctx.match[1] === "next" ? 1 : -1); if (next >= 0 && next < p.tracks.length) { const track = d.tracks[p.tracks[next]]; if (track) { const state: Playback = { ...old, track: track.id, position: 0, playing: true, updatedAt: now() }; await savePlayback(ctx, state); await show(ctx, track, state, true); return; } } } } await ctx.reply("There’s nowhere else to go here yet — try another track from Search."); });
composer.callbackQuery(/^preview:none:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); await ctx.reply("This song doesn’t have a preview, but you can still play it or add it to a playlist.", { reply_markup: inlineKeyboard([[inlineButton("▶️ Play", `play:${ctx.match[1]}`), inlineButton("➕ Add", `add:${ctx.match[1]}`)]]) }); });
composer.callbackQuery(/^preview:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); const d = await readDomain(ctx); const track = d.tracks[ctx.match[1]]; if (!track?.preview) { await ctx.reply("This song doesn’t have a preview, but you can still play it or add it to a playlist."); return; } const state: Playback = { user: user(ctx), context: "track", contextId: track.id, track: track.id, position: 0, playing: true, updatedAt: now() }; await savePlayback(ctx, state); await show(ctx, track, state); });
export default composer;
