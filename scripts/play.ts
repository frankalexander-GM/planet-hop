/**
 * Planet Hop — local game server.
 *
 * Serves `public/` so you can play on a phone on the same Wi-Fi:
 *   PC:    http://localhost:8901
 *   Phone: http://<your-pc-ip>:8901
 *
 * Zero dependencies. Run the multiplayer server too (bun run net).
 */

const PORT = Number(process.env.PORT || 8901);

/** file:// URL -> OS path (works on Windows C:/... and on Linux). */
function filePathFromUrl(u: URL): string {
  let p = u.pathname;
  try { p = decodeURIComponent(p); } catch { /* keep raw */ }
  if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1); // /C:/x -> C:/x
  return p;
}

const server = Bun.serve({
  port: PORT,
  hostname: '0.0.0.0', // reachable from the phone, not just localhost
  async fetch(req) {
    const path = new URL(req.url).pathname;
    const file = path === '/' ? '/index.html' : path;
    // Only ever serve from inside public/.
    const safe = file.replace(/\/+/g, '/').replace(/\.\./g, '');
    const target = new URL('../public' + safe, import.meta.url);
    const file2 = Bun.file(filePathFromUrl(target));
    if (await file2.exists()) {
      return new Response(file2, {
        headers: {
          'Content-Type': file2.type || 'application/octet-stream',
          // Always hand over the newest build during play-testing.
          'Cache-Control': 'no-store',
        },
      });
    }
    return new Response('Not found', { status: 404 });
  },
});

console.log(`[planet-hop] game on port ${PORT}`);
console.log(`[planet-hop] phone: http://<this-pc-ip>:${PORT}`);
console.log(`[planet-hop] net server: bun run net  (port 8902)`);