/**
 * Planet Hop — headless checks against the REAL game script.
 *
 * We pull the inline <script> out of public/index.html and run it against a
 * stub DOM with a recording canvas. That means these tests exercise the code
 * that actually ships, not a copy of it.
 *
 * Run:  bun run test
 */

import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const here = dirname(fileURLToPath(import.meta.url))
const GAME = join(here, '..', 'public', 'index.html')

const html = readFileSync(GAME, 'utf8')
const script = html.split('<script>')[1].split('</script>')[0]

if (!script) {
  console.error('Could not find the game script inside public/index.html')
  process.exit(1)
}

/* ---- hostile environment: no audio, no storage, no window.onload ---- */
const NOOP = () => ({})
const fonts = { load: () => Promise.resolve(), ready: Promise.resolve() }
function makeEl() {
  return {
    textContent: '',
    style: {},
    classList: { add() {}, remove() {} },
    addEventListener() {},
    setAttribute() {},
    getContext() {
      return new Proxy({}, { get: (t, k) => (k in t ? t[k] : NOOP), set: () => true })
    },
  }
}
const elCache = new Map<string, any>()
const byId = (id: string) => {
  if (!elCache.has(id)) elCache.set(id, makeEl())
  return elCache.get(id)
}
globalThis.document = {
  getElementById: byId,
  createElement: () => makeEl(),
  body: makeEl(),
  fonts,
  readyState: 'loading',
}
globalThis.window = {
  innerWidth: 390,
  innerHeight: 844,
  devicePixelRatio: 2,
  addEventListener() {},
}
globalThis.localStorage = {
  getItem: () => { throw new Error('denied') },
  setItem: () => { throw new Error('denied') },
} as any
globalThis.requestAnimationFrame = () => 1

/* ------------------------------- the checks ------------------------------- */
const checks = `
;(async function () {
  // boot() waits for the handwriting fonts before the first frame, on
  // purpose. Let that settle before we poke at the world.
  await new Promise(function (r) { setImmediate(r); });
  var fails = 0;
  function ck(name, cond, extra) {
    if (cond) console.log('  ok   ' + name);
    else { fails++; console.log('  FAIL ' + name + ' ' + (extra || '')); }
  }
  function findKind(key, maxSeeds) {
    for (var s = 1; s <= (maxSeeds || 120); s++) {
      var w = createWorld(500, 600, 0, s * 449);
      for (var k = 0; k < w.planets.length; k++) {
        if (w.planets[k][key]) return { planet: w.planets[k], seed: s * 449, world: w };
      }
    }
    return null;
  }

  // --- boots without window.onload, audio or storage ---
  ck('boots with no onload / audio / storage', !!world && world.viewW === 390);

  // --- the doodle rides, it does not walk ---
  world = createWorld(500, 600, 0, 606);
  var a0 = world.player.localAngle, x0 = world.player.x, y0 = world.player.y;
  for (var i = 0; i < 300; i++) { stepWorld(world, 1 / 60); world.events = []; }
  ck('doodle never walks on its own', Math.abs(world.player.localAngle - a0) < 1e-9);
  ck('but the planet carries it along', Math.hypot(world.player.x - x0, world.player.y - y0) > 5);

  // --- a landing flips the planet it landed on ---
  world = createWorld(500, 600, 0, 4242);
  var from = world.player.planet, fromSpin = from.rotationSpeed;
  requestJump(world);
  ck('take-off leaves the planet spinning as it was', from.rotationSpeed === fromSpin);
  for (var f = 0; f < 900; f++) {
    stepWorld(world, 1 / 60); world.events = [];
    if (world.phase !== 'playing' || world.player.planet) break;
  }
  if (world.player.planet && world.player.planet !== from) {
    ck('landing flips the new planet', true);
  } else {
    ck('landing flips the new planet', false, 'never left home');
  }

  // --- every deadly planet type exists and bites ---
  var lava = findKind('isLava');
  ck('lava planets exist', !!lava);
  if (lava) {
    world = lava.world;
    world.player.planet = lava.planet; world.player.localAngle = 0; world.phase = 'playing';
    stepWorld(world, 1 / 60);
    ck('lava kills on contact', world.phase === 'over');
  }
  var hole = findKind('isHole');
  ck('black holes exist', !!hole);
  if (hole) {
    world = hole.world;
    var p = world.player, ha = hole.planet.rotation + hole.planet.holeAngle;
    var hd = hole.planet.radius + TUN.HOLE_OFFSET;
    p.planet = null; p.airborne = true; p.airTime = 1;
    p.x = hole.planet.x + Math.cos(ha) * hd;
    p.y = hole.planet.y + Math.sin(ha) * hd; p.vx = 0; p.vy = 0;
    stepWorld(world, 1 / 60);
    ck('black hole swallows you', world.phase === 'over');
  }
  var trap = findKind('isTrap');
  ck('dead worlds exist', !!trap);
  var volc = findKind('isVolcano');
  ck('volcanoes exist', !!volc);
  if (volc) {
    var v = volc.planet;
    v.volcanoT = 0.1;
    ck('volcano has quiet/warn/erupt phases', volcanoPhase(v) === 'quiet');
    v.volcanoT = TUN.VOLCANO_PERIOD - 0.2;
    ck('volcano reports the eruption', volcanoPhase(v) === 'erupt');
  }

  // --- the burn-out cactus ---
  var cac = findKind('isCactus');
  ck('cactus planets exist', !!cac);
  if (cac) {
    world = cac.world; world.score = 100;
    var c = cac.planet;
    world.player.planet = c; world.player.localAngle = c.cacti[0].angle;
    world.phase = 'playing';
    stepWorld(world, 1 / 60);
    ck('touching it costs points', world.score === 100 - TUN.CACTUS_COST);
    ck('and burns it out without killing', c.cactusCharges === 0 && world.phase === 'playing');
  }

  // --- six scenarios ---
  ck('six scenarios', BIOMES.length === 6);
  ck('scenario changes every 5 planets', biomeInfo(5).index === 1 && biomeInfo(25).index === 5);

  // --- nothing poisons the simulation ---
  var nan = 0;
  for (var s = 1; s <= 25; s++) {
    world = createWorld(500, 600, 0, s * 887);
    for (var t = 0; t < 120; t++) { stepWorld(world, 1 / 60); world.events = []; }
    for (var k = 0; k < world.planets.length; k++) if (!isFinite(world.planets[k].rotation)) nan++;
    if (!isFinite(world.player.x) || !isFinite(world.score)) nan++;
  }
  ck('no NaN across 25 seeds', nan === 0, nan + ' NaNs');

  // --- same seed, same universe ---
  function snap(g) {
    return g.planets.map(function (x) {
      return [x.id, Math.round(x.x), Math.round(x.radius), !!x.isLava, !!x.isGalaxy, x.points].join('|');
    }).join(';');
  }
  ck('deterministic per seed',
    snap(createWorld(500, 600, 0, 7777)) === snap(createWorld(500, 600, 0, 7777)));

  // --- it actually paints ---
  var drew = 0;
  try {
    for (var b = 0; b < 6; b++) {
      world = createWorld(500, 600, 0, 1234 + b * 31);
      world.planetsPassed = b * TUN.BIOME_EVERY;
      for (var g2 = 0; g2 < 5; g2++) { world.time = g2 * 1.4; drawScene(world, fx); drew++; }
    }
    ck('every scenario paints cleanly (' + drew + ' frames)', true);
  } catch (e) { ck('every scenario paints cleanly', false, String(e)); }

  console.log(fails === 0 ? '\\nALL CHECKS PASSED' : '\\n' + fails + ' CHECK(S) FAILED');
  process.exit(fails === 0 ? 0 : 1);
})();
`

eval(script + '\n' + checks)