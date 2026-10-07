/**
 * Planet Hop — web server (single port for Docker / Coolify).
 *
 * Serves the game AND the multiplayer relay on ONE port, so one public
 * URL does everything (page + wss on the same origin, no extra ports).
 *
 *   bun server/web.ts        (PORT env or 8901)
 *
 * Health: GET /health -> { ok, rooms }
 * Game:   GET /        -> public/index.html (Cache-Control: no-store)
 * Relay:  any path upgrades to WebSocket (protocol in server/rooms.ts)
 */

import { rooms, wsOpen, wsMessage, wsClose, startLoops } from './rooms.ts';

/** Minimal Bun surface: this file only needs `Bun.serve`. Declared here so
 *  the repo does not need @types/bun just for a couple of calls. */
declare const Bun: { serve: (cfg: any) => { port: number }; file: (path: string) => any };

const PORT = Number(process.env.PORT || 8901);

startLoops();

/** file:// URL -> OS path (works on Windows C:/... and on Linux). */
function filePathFromUrl(u: URL): string {
  let p = u.pathname;
  try { p = decodeURIComponent(p); } catch { /* keep raw */ }
  if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1); // /C:/x -> C:/x
  return p;
}

async function servePublic(req: Request): Promise<Response> {
  const path = new URL(req.url).pathname;
  const file = path === '/' ? '/index.html' : path;
  // Only ever serve from inside public/.
  const safe = file.replace(/\/+/g, '/').replace(/\.\./g, '');
  const target = new URL('../public' + safe, import.meta.url);
  const f = Bun.file(filePathFromUrl(target as URL));
  if (await f.exists()) {
    return new Response(f, {
      headers: {
        'Content-Type': f.type || 'application/octet-stream',
        // Always hand over the newest build during play-testing.
        'Cache-Control': 'no-store',
      },
    });
  }
  return new Response('Not found', { status: 404 });
}

const server = Bun.serve({
  port: PORT,
  hostname: '0.0.0.0', // reachable from phones and from Coolify's proxy
  fetch(req, srv) {
    if (new URL(req.url).pathname === '/health') {
      return Response.json({ ok: true, rooms: rooms.size });
    }
    // Plain browser navigation is NOT a socket: fall through to files.
    // A real WebSocket handshake upgrades here (same origin, any path).
    if (srv.upgrade(req)) return undefined;
    return servePublic(req);
  },
  websocket: {
    open: wsOpen,
    message: wsMessage,
    close: wsClose,
  },
});

console.log(`[planet-hop] web on ${PORT} · game + relay · health at /health`);
void server;
