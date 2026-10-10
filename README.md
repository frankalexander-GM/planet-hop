# Planet Hop

A hand-drawn planet-hopping game. Hop from world to world, collect stars, dodge
the things that want you dead. Everything is pencil on paper — no game engine, no
dependencies, one HTML file.

![scenarios](https://img.shields.io/badge/scenarios-6-brightgreen) ![deps](https://img.shields.io/badge/dependencies-0-blue)

## Play it

```bash
bun run play
```

- **On the PC**: <http://localhost:8901>
- **On your phone**: `http://<your-pc-ip>:8901` (same Wi-Fi)

Want to test on your phone? If Windows asks about firewall access, allow it.

## Controls

| Action | How |
| --- | --- |
| Jump | `Space`, click, or tap |
| Glide | hold the jump key in the air — slower fall, more air control |
| Restart | `R` |

## Learn English while you play

Choose A2 or B1 before a run. Random translation, vocabulary and grammar
challenges appear at each new 300-point milestone. In solo mode, a correct translation
after a death revives you at your last safe planet; an incorrect answer ends
the run and lets you start again from zero. Questions pause that player's
movement while the multiplayer room clock, when active, continues.

## The two rules that matter

1. **The doodle never walks.** It sticks to one spot on the planet. The planet
   spins, so you ride along with it — and the hazards sweep past *you*.
2. **Every landing flips the planet.** The world you just landed on reverses
   direction and spins up. The hop you just made inherited the spin it had, so
   timing is your only steering.

## Worlds

Climb five planets and the whole scenario changes: sky, weather, what floats
past, even how the ink reads.

| Planets | Scenario | What changes |
| --- | --- | --- |
| 0–4 | Notebook Day | Paper, sun, clouds |
| 5–9 | Golden Dusk | Orange sky, low squashed sun |
| 10–14 | Starlit Night | Night wash, cratered moon, stars |
| 15–19 | The Storm | Grey, slanting rain, forked lightning |
| 20–24 | Aurora Sky | Green and violet curtains |
| 25+ | Deep Space | Almost black, stars only |

## Planet types

| | Type | What it does |
| --- | --- | --- |
| ● | Normal | Pays its random purse (+5 to +30) |
| ● | Golden | +25 or more, worth the detour |
| ● | Devil | Deadly dust devil, drifts along the surface |
| ● | Cactus | Costs points and burns out; re-arms with more lives the higher you get |
| ● | Point leech | A red mouth that docks your score on landing |
| ● | Galaxy | Tolls points but pulls 2.5× harder |
| ● | Lava | The whole crust is lethal |
| ● | Volcano | Quiet → warns → erupts. Only the eruption kills |
| ● | Black hole | Sits above the surface, tugs hardest, eats you |
| ● | Dead world | No pull, no mercy |

Plus decorative towers with a working beam, Saturn rings, sleepy planet faces
and hot-air balloons.

## Multiplayer (optional)

The relay server and referee are done and tested. Each client simulates its own
doodle so your jumps feel instant; the server arbitrates what has to be shared.

- **Shared stars**: the star on planet #N is worth +5 to whoever grabs it first
- **Medals by altitude**: 40 m, 80 m, 120 m, awarded live
- **Nobody is eliminated**: you fall, you climb again. Gold closes the round and
  the podium shows everyone who earned a medal
- Rooms of up to 8 players, shared 4-letter code

```bash
bun run net     # port 8902
```

The game finds the server on its own host, so a phone on the same Wi-Fi connects
without editing anything. Point it elsewhere with `?server=host:port`.

The lobby and the live leaderboard are the next piece of work — the server side
is ready and waiting.

## How it is put together

```
public/index.html    the whole game: tunables, sketch primitives, world rules,
                      renderer, effects, input, boot
server/net-server.ts  WebSocket relay + referee (zero dependencies)
scripts/play.ts       static server for local play
tests/run.ts          headless checks against the real game script
```

The game file is layered top to bottom: **tunables → hand-drawn primitives →
sound → world rules → renderer → boot**. The world layer never draws and the
renderer never mutates state, which is why the tests can drive thousands of
simulated frames with a fake canvas.

Every planet is generated from `(index, seed)`, so the same room code gives
everyone the identical chain of worlds — that is what lets the server referee a
game nobody has to download.

## Tests

```bash
bun run test
```

Runs the real game script headlessly: jump physics, planetary attraction, all
ten planet types, the burn-out cactus, scenario changes, determinism and a
no-`NaN` sweep across dozens of seeds.

## License

MIT
