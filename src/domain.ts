import type { Ctx } from "./bot.js";
import { defaultRedisStorage } from "./toolkit/session/redis.js";

export type Track = {
  id: string;
  title: string;
  artist: string;
  duration: number;
  source: string;
  preview?: string;
};

export type Playlist = {
  id: string;
  owner: number;
  name: string;
  tracks: string[];
  createdAt: number;
  updatedAt: number;
};

export type Playback = {
  user: number;
  context: "track" | "playlist";
  contextId: string;
  track: string;
  position: number;
  playing: boolean;
  updatedAt: number;
};

type Domain = { tracks: Record<string, Track>; playlists: Record<string, Playlist>; playback: Record<string, Playback> };
type D1 = { prepare(sql: string): { bind(...values: unknown[]): { first<T>(): Promise<T | null>; run(): Promise<unknown> } } };
const redisDomain = typeof process !== "undefined" && process.env.REDIS_URL
  ? defaultRedisStorage<Domain>(process.env.REDIS_URL)
  : undefined;

export const now = (): number => Date.now();

function envOf(ctx: Ctx): { DB?: D1 } | undefined {
  return (ctx as Ctx & { env?: { DB?: D1 } }).env;
}

function fallback(ctx: Ctx): Domain {
  const session = ctx.session as typeof ctx.session & { domain?: Domain };
  session.domain ??= { tracks: {}, playlists: {}, playback: {} };
  return session.domain;
}

async function d1(ctx: Ctx): Promise<D1 | undefined> {
  return envOf(ctx)?.DB;
}

export async function readDomain(ctx: Ctx): Promise<Domain> {
  const db = await d1(ctx);
  const key = String(ctx.chat?.id ?? ctx.from?.id);
  if (!db && redisDomain) return (await redisDomain.read(`domain:${key}`)) ?? { tracks: {}, playlists: {}, playback: {} };
  if (!db) return fallback(ctx);
  await db.prepare("CREATE TABLE IF NOT EXISTS faple_domain (key TEXT PRIMARY KEY, value TEXT NOT NULL)").bind().run();
  const row = await db.prepare("SELECT value FROM faple_domain WHERE key = ?").bind(String(ctx.chat?.id ?? ctx.from?.id)).first<{ value: string }>();
  if (!row) return { tracks: {}, playlists: {}, playback: {} };
  try { return JSON.parse(row.value) as Domain; } catch { return { tracks: {}, playlists: {}, playback: {} }; }
}

export async function writeDomain(ctx: Ctx, domain: Domain): Promise<void> {
  const db = await d1(ctx);
  const key = String(ctx.chat?.id ?? ctx.from?.id);
  if (!db && redisDomain) { await redisDomain.write(`domain:${key}`, domain); return; }
  if (!db) { fallback(ctx).tracks = domain.tracks; fallback(ctx).playlists = domain.playlists; fallback(ctx).playback = domain.playback; return; }
  await db.prepare("INSERT OR REPLACE INTO faple_domain (key, value) VALUES (?, ?)").bind(key, JSON.stringify(domain)).run();
}

export async function saveTrack(ctx: Ctx, track: Track): Promise<void> {
  const domain = await readDomain(ctx); domain.tracks[track.id] = track; await writeDomain(ctx, domain);
}

export async function userPlaylists(ctx: Ctx): Promise<Playlist[]> {
  const domain = await readDomain(ctx); const owner = ctx.from?.id ?? ctx.chat?.id ?? 0;
  return Object.values(domain.playlists).filter((p) => p.owner === owner);
}

export async function savePlayback(ctx: Ctx, state: Playback): Promise<void> {
  const domain = await readDomain(ctx); domain.playback[String(state.user)] = state; await writeDomain(ctx, domain);
}

export async function notifyOwner(ctx: Ctx, message: string): Promise<void> {
  const { adminChatId } = await import("./toolkit/index.js");
  const owner = adminChatId(ctx as Ctx & { env?: Record<string, unknown> });
  if (!owner) return;
  try { await ctx.api.sendMessage(owner, message); } catch { /* A blocked or unstarted owner must not break the user's flow. */ }
}
