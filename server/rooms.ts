/**
 * ============================================================
 *  PLANET HOP — rooms (shared multiplayer relay + referee)
 * ============================================================
 *  Self-contained: plain WebSockets, zero dependencies. No database, no
 *  auth — pick a name, share a 4-letter room code, hop together.
 *
 *  Used by both servers (same logic, same protocol):
 *    server/net-server.ts  relay only (local dev, port 8902)
 *    server/web.ts         game + relay on ONE port (Docker / Coolify)
 *
 *  THE SCORING IDEA — nobody is eliminated:
 *    - The room shares one seed, so every player climbs the SAME chain of
 *      planets with the same cacti, leeches, galaxies and traps.
 *    - Stars are shared: a star on planet #N is worth +5 to whoever grabs
 *      it first. Server arbitrates by planet INDEX, so it works even when
 *      players have different screen sizes.
 *    - Medals by altitude (40m / 80m / 120m), awarded live. The round ends
 *      when someone takes gold, and everyone who earned a medal keeps it.
 *      Falling just means you climb again — you are never out.
 *
 *  Planets are never transmitted: same seed + same index = same planet.
 *
 *  Protocol — one JSON object per message:
 *   C->S  {t:'hello'}                     -> S {t:'welcome', id}
 *   C->S  {t:'create', name}              -> S {t:'room', code, seed, ...}
 *   C->S  {t:'join', code, name}          -> S {t:'room', ...} | {t:'error', message}
 *   C->S  {t:'ready'}                     -> S {t:'go'}  (round starts)
 *   C->S  {t:'pos', x, y, alt, planet, angle, air, score}
 *                                         -> S {t:'states', states:[...]}
 *   C->S  {t:'star', planet}              -> S {t:'starTaken', planet, by, score}
 *   C->S  {t:'rematch'}                   -> S {t:'reset'}
 *   S->*  {t:'players', players:[{id,name,color,score,alt,medal}]}
 *   S->*  {t:'medal', place, id, name}
 *   S->*  {t:'over', podium:[{place,id,name,score,alt}]}
 *   S->*  {t:'bye', id}
 */

// Room size + pacing. Bump MAX_PLAYERS only with matching client colors.
export const MAX_PLAYERS = 5;
export const POS_PER_SECOND = 10;

/** Altitude in metres (the client counts 50 world px as one metre). */
export const MEDALS = [40, 80, 120];
export const MEDAL_NAMES = ['🥇 Gold', '🥈 Silver', '🥉 Bronze'];

export const DOODLE_COLORS = [
  '#8B5CF6', '#EC4899', '#22C55E', '#F59E0B',
  '#06B6D4', '#EF4444', '#A3E635', '#F97316',
  '#14B8A6', '#E879F9',
];
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function makeCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) code += CODE_ALPHABET[(Math.random() * CODE_ALPHABET.length) | 0];
  return code;
}

export function cleanName(raw: unknown): string {
  const name = String(raw ?? 'Player').trim().slice(0, 14);
  return name || 'Player';
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export interface Player {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  w: number;   // sender screen width: x travels as x/w so every
  alt: number;   // metres climbed
  planet: number | null;
  angle: number;
  air: boolean;
  score: number;
  dead: boolean;
}

export interface Room {
  code: string;
  seed: number;
  players: Map<string, Player>;
  sockets: Map<string, any>;
  /** planet index -> player name who claimed its star */
  stars: Map<number, string>;
  /** medal place -> player name */
  medals: Map<number, string>;
  /** planet index -> shared spin state (same rotation for all) */
  flips: Map<number, { n: number; rot: number; speed: number }>;
  /** creator's player id */
  creatorId: string | null;
  over: boolean;
  started: boolean;
  createdAt: number;
}

export const rooms = new Map<string, Room>();
let nextId = 1;

export function broadcast(room: Room, message: object) {
  const text = JSON.stringify(message);
  for (const ws of room.sockets.values()) {
    try { ws.send(text); } catch { /* cleaned on close */ }
  }
}

function podium(room: Room) {
  return [...room.medals.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([place, name]) => {
      const p = [...room.players.values()].find((x) => x.name === name);
      return {
        place: place + 1,
        medal: MEDAL_NAMES[place],
        id: p?.id ?? '',
        name,
        score: p?.score ?? 0,
        alt: Math.round(p?.alt ?? 0),
      };
    });
}

export function announcePlayers(room: Room) {
  const list = [...room.players.values()].map((p) => ({
    id: p.id, name: p.name, color: p.color,
    score: p.score, alt: Math.round(p.alt), dead: p.dead,
  }));
  broadcast(room, { t: 'players', players: list, medals: podium(room) });
}

function pickColor(room: Room): string {
  const used = new Set([...room.players.values()].map((p) => p.color));
  for (const c of DOODLE_COLORS) if (!used.has(c)) return c;
  return DOODLE_COLORS[(Math.random() * DOODLE_COLORS.length) | 0];
}

/** Live medals: first one to each altitude takes it, once per round. */
function checkMedals(room: Room, player: Player) {
  for (let place = 0; place < MEDALS.length; place++) {
    if (room.medals.has(place)) continue;
    if (player.alt < MEDALS[place]) continue;
    room.medals.set(place, player.name);
    broadcast(room, { t: 'medal', place, id: player.id, name: player.name });
    if (place === 0) {
      room.over = true;
      broadcast(room, { t: 'over', podium: podium(room) });
    }
    announcePlayers(room);
    return;
  }
}

function joinRoom(room: Room, ws: any, ctx: any, name: string) {
  if (ctx.room && ctx.room !== room) {
    ctx.room.sockets.delete(ctx.id);
    ctx.room.players.delete(ctx.id);
    broadcast(ctx.room, { t: 'bye', id: ctx.id });
    announcePlayers(ctx.room);
  }
  const id = ctx.id as string;
  room.sockets.set(id, ws);
  room.players.set(id, {
    id, name, color: pickColor(room),
    x: 0, y: 0, w: 0, alt: 0, planet: null, angle: 0, air: true,
    score: 0, dead: false,
  });
  ctx.room = room;
  ws.send(JSON.stringify({
    t: 'room',
    code: room.code,
    seed: room.seed,
    creatorId: room.creatorId,
    you: { id, name, color: room.players.get(id)!.color },
    players: [...room.players.values()].map((p) => ({
      id: p.id, name: p.name, color: p.color, score: p.score, alt: 0, dead: false,
    })),
    medals: [],
    started: room.started,
    medalMeters: MEDALS,
  }));
  announcePlayers(room);
}

// Bun websocket handlers — shared by net-server.ts and web.ts.
export function wsOpen(ws: any) {
  ws.data = { id: null as string | null, room: null as Room | null, stamps: [] as number[] };
}

export function wsMessage(ws: any, raw: any) {
  const ctx = ws.data;
  const now = Date.now();
  ctx.stamps = ctx.stamps.filter((t: number) => t > now - 1000);
  if (ctx.stamps.length >= 40) return;
  ctx.stamps.push(now);

  let msg: any;
  try { msg = JSON.parse(String(raw).slice(0, 4096)); } catch { return; }
  if (!msg || typeof msg.t !== 'string') return;

  if (msg.t === 'hello') {
    ctx.id = 'p' + nextId++;
    ws.send(JSON.stringify({ t: 'welcome', id: ctx.id }));
    return;
  }

  if (msg.t === 'create') {
    if (!ctx.id) return;
    let code = makeCode();
    while (rooms.has(code)) code = makeCode();
    const room: Room = {
      code, seed: (Math.random() * 0x7fffffff) | 0,
      players: new Map(), sockets: new Map(),
      stars: new Map(), medals: new Map(), flips: new Map(),
      creatorId: ctx.id,
      over: false, started: false, createdAt: Date.now(),
    };
    rooms.set(code, room);
    joinRoom(room, ws, ctx, cleanName(msg.name));
    console.log(`[planet-hop] room ${code} created by ${cleanName(msg.name)}`);
    return;
  }

  if (msg.t === 'join') {
    if (!ctx.id) return;
    const room = rooms.get(String(msg.code ?? '').toUpperCase().slice(0, 8));
    if (!room) {
      ws.send(JSON.stringify({ t: 'error', message: 'Room not found. Check the code.' }));
      return;
    }
    if (room.players.size >= MAX_PLAYERS) {
      ws.send(JSON.stringify({ t: 'error', message: 'Room is full (10 max).' }));
      return;
    }
    if (room.over) {
      ws.send(JSON.stringify({ t: 'error', message: 'Round finished. Ask for a rematch.' }));
      return;
    }
    joinRoom(room, ws, ctx, cleanName(msg.name));
    return;
  }

  const room: Room | null = ctx.room;
  const id: string | null = ctx.id;
  if (!room || !id) return;

  if (msg.t === 'ready') {
    room.started = true;
    broadcast(room, { t: 'go', seed: room.seed });
    return;
  }

  // Shared spin: whoever lands flips the planet for EVERYONE,
  // so all screens rotate together with no distortion.
  if (msg.t === 'flip') {
    const planet = msg.planet;
    if (!Number.isInteger(planet) || planet < 0) return;
    const prev = room.flips.get(planet);
    const n = (prev?.n || 0) + 1;
    const rot = isNum(msg.rot) ? msg.rot : 0;
    const speed = isNum(msg.speed) ? msg.speed : 0;
    room.flips.set(planet, { n, rot, speed });
    const who = room.players.get(id);
    broadcast(room, { t: 'flipped', planet, n, rot, speed, by: id, name: who?.name || '' });
    return;
  }

  // Catch-up for respawns: same spin state, no distortion.
  if (msg.t === 'sync') {
    ws.send(JSON.stringify({
      t: 'syncState',
      flips: [...room.flips.entries()].map(([planet, f]) => ({ planet, n: f.n, rot: f.rot, speed: f.speed })),
    }));
    return;
  }

  if (msg.t === 'pos') {
    const p = room.players.get(id);
    if (!p) return;
    if (isNum(msg.x) && isNum(msg.y) && Math.abs(msg.x) < 1e5 && Math.abs(msg.y) < 1e6) {
      p.x = msg.x;
      p.y = msg.y;
    }
    if (isNum(msg.w) && msg.w > 0) p.w = Math.min(msg.w, 5000); // screen width for x-normalizing
    if (isNum(msg.alt) && msg.alt > p.alt) p.alt = Math.min(msg.alt, 9999); // best height kept
    p.planet = Number.isInteger(msg.planet) ? msg.planet : null;
    p.angle = isNum(msg.angle) ? msg.angle : 0;
    p.air = msg.air === true;
    p.dead = msg.dead === true;
    checkMedals(room, p);
    return;
  }

  if (msg.t === 'star') {
    const planet = msg.planet;
    if (!Number.isInteger(planet) || planet < 0) return;
    const p = room.players.get(id);
    if (!p || room.over) return;
    if (room.stars.has(planet)) return; // first grab wins
    room.stars.set(planet, p.name);
    p.score += 5;
    broadcast(room, { t: 'starTaken', planet, by: p.name, score: p.score });
    announcePlayers(room);
    return;
  }

  if (msg.t === 'rematch') {
    room.seed = (Math.random() * 0x7fffffff) | 0;
    room.stars.clear();
    room.medals.clear();
    room.flips.clear();
    room.over = false;
    room.started = false;
    for (const p of room.players.values()) {
      p.score = 0; p.alt = 0; p.dead = false;
    }
    broadcast(room, { t: 'reset', seed: room.seed });
    announcePlayers(room);
    console.log(`[planet-hop] room ${room.code} rematch (seed ${room.seed})`);
    return;
  }
}

export function wsClose(ws: any) {
  const ctx = ws.data;
  const room: Room | null = ctx?.room;
  const id: string | null = ctx?.id;
  if (!room || !id) return;
  room.sockets.delete(id);
  room.players.delete(id);
  broadcast(room, { t: 'bye', id });
  announcePlayers(room);
  if (room.sockets.size === 0) {
    rooms.delete(room.code);
    console.log(`[planet-hop] room ${room.code} closed (empty)`);
  }
}

let loopsStarted = false;
/** Room sweep + 10/s ghost broadcast. Call once per process. */
export function startLoops() {
  if (loopsStarted) return;
  loopsStarted = true;
  setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      if (room.sockets.size === 0 && now - room.createdAt > 60_000) {
        rooms.delete(code);
        console.log(`[planet-hop] room ${code} swept (empty)`);
      }
    }
  }, 60_000);

  setInterval(() => {
    for (const room of rooms.values()) {
      if (room.sockets.size === 0) continue;
      broadcast(room, {
        t: 'states',
      states: [...room.players.values()].map((p) => ({
        id: p.id,
        x: Math.round(p.x * 10) / 10,
        y: Math.round(p.y * 10) / 10,
        w: p.w,
          planet: p.planet,
          angle: Math.round(p.angle * 1000) / 1000,
          air: p.air,
          score: p.score,
          dead: p.dead,
        })),
      });
    }
  }, 1000 / POS_PER_SECOND);
}
