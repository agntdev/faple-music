import type { Ctx, Session } from "./bot.js";
import type { Playback, Playlist, Track } from "./domain.js";

export type FlowSession = Session & {
  step?: "search" | "playlist-name" | "playlist-rename";
  pendingPlaylist?: string;
  domain?: { tracks: Record<string, Track>; playlists: Record<string, Playlist>; playback: Record<string, Playback> };
};

export const flow = (ctx: Ctx): FlowSession => ctx.session as FlowSession;
