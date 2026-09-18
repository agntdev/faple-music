import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";

registerMainMenuItem({ label: "🔥 Trending", data: "trending:list", order: 30 });
const composer = new Composer<Ctx>();
composer.callbackQuery("trending:list", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply("Trending is taking a little encore break. Try Search to find a song you love.", { reply_markup: inlineKeyboard([[inlineButton("🔎 Search", "search:start"), inlineButton("⬅️ Menu", "menu:main")]]) });
});
export default composer;
