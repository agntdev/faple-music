import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { saveTrack, now, type Track } from "../domain.js";
import { flow } from "../flow.js";

registerMainMenuItem({ label: "🔎 Search", data: "search:start", order: 10 });
const composer = new Composer<Ctx>();

composer.callbackQuery("search:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  flow(ctx).step = "search";
  await ctx.reply("What song are you looking for?", { reply_markup: { force_reply: true, input_field_placeholder: "Type a song or artist…" } });
});

composer.on("message:text", async (ctx, next) => {
  if (flow(ctx).step !== "search") return next();
  const query = ctx.message.text.trim();
  flow(ctx).step = undefined;
  if (!query) { await ctx.reply("Send a song or artist name and I’ll look again."); return; }
  // The blueprint supplies no resolver URL or credentials. Keep the result honest:
  // no fabricated catalogue entries are presented as real music.
  const matches: Track[] = [];
  for (const track of matches) await saveTrack(ctx, track);
  if (matches.length === 0) {
    await ctx.reply(`I couldn't find “${query}” yet. Try another spelling or tap Trending.`, { reply_markup: inlineKeyboard([[inlineButton("🔥 Trending", "trending:list")]]) });
    return;
  }
  await ctx.reply(matches.map((t) => `🎵 ${t.title} — ${t.artist}`).join("\n\n"), { reply_markup: inlineKeyboard(matches.slice(0, 8).map((t) => [inlineButton("▶️ Play", `play:${t.id}`), ...(t.preview ? [inlineButton("🎧 Preview", `preview:${t.id}`)] : [inlineButton("Preview unavailable", `preview:none:${t.id}`)]), inlineButton("➕ Add", `add:${t.id}`)])) });
});

export default composer;
