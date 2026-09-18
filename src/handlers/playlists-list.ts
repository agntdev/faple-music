import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { confirmKeyboard, inlineButton, inlineKeyboard, paginate, registerMainMenuItem } from "../toolkit/index.js";
import { now, readDomain, userPlaylists, writeDomain, type Playlist } from "../domain.js";
import { flow } from "../flow.js";

registerMainMenuItem({ label: "🎶 My Playlists", data: "playlists:list", order: 20 });
const composer = new Composer<Ctx>();
const owner = (ctx: Ctx) => ctx.from?.id ?? ctx.chat?.id ?? 0;

async function show(ctx: Ctx, edit = false): Promise<void> {
  const list = await userPlaylists(ctx);
  const rows = list.map((p) => [inlineButton(p.name, `playlist:open:${p.id}`), inlineButton("Rename", `playlist:rename:${p.id}`), inlineButton("Delete", `playlist:delete:${p.id}`)]);
  rows.push([inlineButton("➕ Create playlist", "playlist:create")], [inlineButton("⬅️ Menu", "menu:main")]);
  const text = list.length ? "Your private playlists are ready for a spin." : "No playlists yet — tap ➕ Create playlist to make one.";
  if (edit) await ctx.editMessageText(text, { reply_markup: inlineKeyboard(rows) }); else await ctx.reply(text, { reply_markup: inlineKeyboard(rows) });
}

composer.callbackQuery("playlists:list", async (ctx) => { await ctx.answerCallbackQuery(); await show(ctx); });
composer.callbackQuery("playlist:create", async (ctx) => { await ctx.answerCallbackQuery(); flow(ctx).step = "playlist-name"; await ctx.reply("What should we call this playlist?", { reply_markup: { force_reply: true, input_field_placeholder: "Playlist name…" } }); });
composer.on("message:text", async (ctx, next) => {
  if (flow(ctx).step !== "playlist-name" && flow(ctx).step !== "playlist-rename") return next();
  const name = ctx.message.text.trim().slice(0, 60);
  const pending = flow(ctx).pendingPlaylist;
  flow(ctx).step = undefined; flow(ctx).pendingPlaylist = undefined;
  if (!name) { await ctx.reply("Give it a name so you can spot it later."); return; }
  const domain = await readDomain(ctx); const id = pending ?? `pl:${owner(ctx)}:${now()}`;
  const old = domain.playlists[id];
  domain.playlists[id] = { id, owner: owner(ctx), name, tracks: old?.tracks ?? [], createdAt: old?.createdAt ?? now(), updatedAt: now() };
  await writeDomain(ctx, domain); await ctx.reply(old ? `Renamed it to “${name}”.` : `“${name}” is ready for your next favorite.`); await show(ctx);
});
composer.callbackQuery(/^playlist:rename:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); const id = ctx.match[1]; const p = (await userPlaylists(ctx)).find((x) => x.id === id); if (!p) { await ctx.reply("That playlist isn’t yours or no longer exists."); return; } flow(ctx).step = "playlist-rename"; flow(ctx).pendingPlaylist = id; await ctx.reply(`What should “${p.name}” be called now?`, { reply_markup: { force_reply: true, input_field_placeholder: "New playlist name…" } }); });
composer.callbackQuery(/^playlist:delete:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); const p = (await userPlaylists(ctx)).find((x) => x.id === ctx.match[1]); if (!p) { await ctx.reply("That playlist isn’t yours or no longer exists."); return; } await ctx.editMessageText(`Delete “${p.name}”?`, { reply_markup: confirmKeyboard(`playlist:confirm-delete:${p.id}`, { yes: "Delete it", no: "Keep it" }) }); });
composer.callbackQuery(/^playlist:confirm-delete:([^:]+):(yes|no)$/, async (ctx) => { await ctx.answerCallbackQuery(); const [, id, answer] = ctx.match; if (answer === "no") { await show(ctx, true); return; } const domain = await readDomain(ctx); if (domain.playlists[id]?.owner !== owner(ctx)) { await ctx.reply("That playlist isn’t yours."); return; } delete domain.playlists[id]; await writeDomain(ctx, domain); await ctx.editMessageText("Playlist deleted — your music is still safe elsewhere."); });
composer.callbackQuery(/^playlist:open:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); const p = (await userPlaylists(ctx)).find((x) => x.id === ctx.match[1]); if (!p) { await ctx.reply("That playlist isn’t yours or no longer exists."); return; } const domain = await readDomain(ctx); const tracks = p.tracks.map((id) => domain.tracks[id]).filter(Boolean); const page = paginate(tracks, { page: 0, perPage: 8, callbackPrefix: `plpage:${p.id}` }); const rows = page.pageItems.map((t) => [inlineButton(`${t.title} — ${t.artist}`, `play:${t.id}:pl:${p.id}`), inlineButton("Remove", `playlist:remove:${p.id}:${t.id}`)]); rows.push([inlineButton("Move up", `playlist:up:${p.id}:0`), inlineButton("Move down", `playlist:down:${p.id}:0`)], [inlineButton("⬅️ Playlists", "playlists:list")]); await ctx.editMessageText(tracks.length ? `“${p.name}” — ${tracks.length} track${tracks.length === 1 ? "" : "s"}` : `“${p.name}” is empty — add tracks from Search.`, { reply_markup: inlineKeyboard(rows) }); });

async function move(ctx: Ctx, id: string, index: number, delta: number): Promise<void> { const domain = await readDomain(ctx); const p = domain.playlists[id]; if (!p || p.owner !== owner(ctx)) { await ctx.reply("That playlist isn’t yours or no longer exists."); return; } const target = index + delta; if (target < 0 || target >= p.tracks.length) { await ctx.answerCallbackQuery({ text: "That track is already at the edge." }); return; } [p.tracks[index], p.tracks[target]] = [p.tracks[target], p.tracks[index]]; p.updatedAt = now(); await writeDomain(ctx, domain); await ctx.answerCallbackQuery(); await ctx.reply("Nice — playlist order updated."); }
composer.callbackQuery(/^playlist:(up|down):([^:]+):(\d+)$/, async (ctx) => { await move(ctx, ctx.match[2], Number(ctx.match[3]), ctx.match[1] === "up" ? -1 : 1); });
composer.callbackQuery(/^playlist:remove:([^:]+):(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); const domain = await readDomain(ctx); const p = domain.playlists[ctx.match[1]]; if (!p || p.owner !== owner(ctx)) { await ctx.reply("That playlist isn’t yours or no longer exists."); return; } p.tracks = p.tracks.filter((id) => id !== ctx.match[2]); p.updatedAt = now(); await writeDomain(ctx, domain); await ctx.reply("Removed — your playlist is feeling tidy."); });
composer.callbackQuery(/^add:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); const lists = await userPlaylists(ctx); if (!lists.length) { await ctx.reply("You don’t have a playlist yet — create one first.", { reply_markup: inlineKeyboard([[inlineButton("➕ Create playlist", "playlist:create")]]) }); return; } await ctx.reply("Which playlist should get this track?", { reply_markup: inlineKeyboard(lists.map((p) => [inlineButton(p.name, `playlist:add:${p.id}:${ctx.match[1]}`)])) }); });
composer.callbackQuery(/^playlist:add:([^:]+):(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); const d = await readDomain(ctx); const p = d.playlists[ctx.match[1]]; if (!p || p.owner !== owner(ctx)) { await ctx.reply("That playlist isn’t yours or no longer exists."); return; } if (!p.tracks.includes(ctx.match[2])) p.tracks.push(ctx.match[2]); p.updatedAt = now(); await writeDomain(ctx, d); await ctx.reply(`Added it to “${p.name}”.`); });
export default composer;
