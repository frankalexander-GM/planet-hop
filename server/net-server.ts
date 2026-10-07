/**
 * ============================================================
 *  PLANET HOP — net server (multiplayer relay + referee)
 * ============================================================
 *  Run:  bun server/net-server.ts   (port 8902)
 *        or: bun run net
 *
 *  Relay only (no game files). For single-port deploys
 *  (Docker / Coolify) use server/web.ts instead.
 *  Shared logic lives in server/rooms.ts.
 */

import { rooms, wsOpen, wsMessage, wsClose, startLoops, MEDALS, MAX_PLAYERS } from './rooms.ts';

/** Minimal Bun surface: this file only needs `Bun.serve`. Declared here so
 *  the repo does not need @types/bun just for one call. */
declare const Bun: { serve: (cfg: any) => { port: number } };

const PORT = Number(process.env.PLANET_HOP_PORT || 8902);

startLoops();

const server = Bun.serve({
  port: PORT,
  fetch(req, srv) {
    if (new URL(req.url).pathname === '/health') {
      return Response.json({ ok: true, rooms: rooms.size });
    }
    if (srv.upgrade(req)) return undefined;
    return new Response('Planet Hop net server. Use a WebSocket client.', { status: 426 });
  },
  websocket: {
    open: wsOpen,
    message: wsMessage,
    close: wsClose,
  },
});

console.log(`[planet-hop] net server on ${PORT} · medals at ${MEDALS.join('m / ')}m · up to ${MAX_PLAYERS} players`);
void server;
