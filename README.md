# Mood Match

A cooperative emotion puzzle for Decentraland, built mobile-first for the
**Friendzone Mobile Buildathon**.

You arrive with a random mood. So does everyone else. Stand together in one of
three Mood Pads, tap **Form Circle**, and the group gets ten seconds to clear a
cooperative mini-game. Complementary moods pay a bonus. Scores persist on a
leaderboard that only moves when people play together.

**There is no way to score alone.** That is the design, not a limitation.

---

## Play it

| | |
|---|---|
| **World** | `CHANGE-ME.dcl.eth` — set this before deploying, see [Deploying](#deploying) |
| **Jump link** | `https://decentraland.org/jump/?realm=CHANGE-ME.dcl.eth` |
| **In-world** | `/goto CHANGE-ME.dcl.eth` |
| **Scene size** | 2x2 parcels (32m x 32m) |
| **Players** | 2-4 per circle, three circles can run at once |
| **Session length** | ~20 seconds per circle, instant restart |

---

## The first 30 seconds

The scene is built so a newcomer understands it without reading anything:

1. You spawn at the south edge looking north across the plaza. The three Mood
   Pads and the central Mood Font are all visible from the spawn point.
2. The HUD tells you your mood and, at all times, **exactly what to do next** —
   "Walk to the North Pad", "2 waiting at the West Pad", "Waiting for 1 more".
3. A pad with someone waiting on it **pulses and fires a column of light** into
   the sky, visible from anywhere in the plaza. That is the social pull: you can
   see where the people are.
4. If nobody else is around, **Practice** runs a mini-game solo so you learn the
   loop. Practice deliberately scores nothing.

---

## Rules

### Moods

Six moods, each with its own colour identity:

| Mood | Colour | Feel |
|---|---|---|
| Calm | blue | Slow breath, steady hands |
| Joy | yellow | Loud, bright, contagious |
| Focus | purple | One target, nothing else |
| Energy | red | Go now, think later |
| Love | pink | Warm, open, generous |
| Curiosity | green | What happens if we try? |

You are assigned one on arrival and can reroll at the Mood Font in the centre
(not while you are in a circle).

### Forming a circle

Stand inside a Mood Pad ring with at least one other player and tap **Form
Circle**. The server checks your real position — being within `3m` of every other
member, pairwise, is what actually forms the circle.

Waiting is visible to everyone: a pad publishes who is standing on it even before
a circle locks in, so other players can come join you.

### Emotion combos

| Combo | Requirement |
|---|---|
| Full Spectrum | 4 players, all different moods |
| Harmony Bonus | Calm + Joy + Focus |
| Spark Circuit | Energy + Curiosity + Joy |
| Devotion Knot | Love + Calm + Focus |
| Open Triad | any 3 different moods |
| Balanced Duet | Calm+Energy, Joy+Focus or Love+Curiosity |
| Twin Flame | everyone the same mood |

Every combo pays the same `+20`, on purpose — no combination should feel like the
wrong one to chase. A circle with no matching pattern still scores.

### Mini-games

All three are 10 seconds and all three are **cooperative by construction** — none
can be cleared by one strong player carrying a passive group.

**Rhythm Tap** — a ring pulses once a second, everyone taps on the beat. The group
needs 60% of the available taps across all members, so a player who has found the
rhythm genuinely helps someone who hasn't.

**Hold Zones** — everyone holds their own coloured zone. The timer **only advances
while every zone is held at once**, and the panel shows exactly who has let go, so
it becomes a conversation instead of a guessing game.

**Color Match** — a colour sequence shows for 2.6 seconds, then hides. A step only
completes once **every** member has tapped that colour, and one wrong tap wipes the
group's progress on the current step. Somebody has to say "green next" out loud.

### Scoring

| | |
|---|---|
| Circle formed | +10 |
| Emotion combo | +20 |
| Mini-game cleared | +30 |
| Holding the featured mood | x2 |
| Daily streak | +5% per consecutive day, capped at +50% |

Ceiling is **180 points** for one perfect circle on a maxed streak. The result
panel itemises every line using the same function the server used to pay it, so
the numbers always reconcile.

### Coming back

- **Daily featured mood** — one mood pays double, rotating every UTC day. It is a
  pure function of the day index, so every client agrees instantly without waiting
  for a sync.
- **Skin unlocks** — 5 successful circles with a mood unlocks its skin.
- **Streaks** — consecutive days played, up to +50%.
- **Invite** — opens a jump link to this exact World plus a "meet at the North Pad"
  hint, because the useful half of an invite is telling your friend *where*.

---

## Mobile-first, specifically

This was designed for a phone and adapted *up* to desktop, not the other way round.

**Layout.** The renderer uses `screenInset: 'interactable'`, which clears the device
notch and the client's minimap, chat and left-side controls. The one thing that
inset does *not* protect is the bottom-right corner — the mobile client draws its
own action buttons over that area by design. So **the primary action is a wide
bottom-centre bar and nothing tappable is ever placed on the right edge**.

**Touch targets.** The main action bar is 460x132 virtual px and mini-game targets
are 150-200px, well above the 80x80 floor. Nothing requires thumb precision.

**Text.** Smallest size used anywhere is 26px against a 1920x1080 virtual canvas,
which the SDK swaps for 1600x720 on phones — so everything renders proportionally
*larger* on mobile. Sans-serif, high contrast throughout.

**No emoji anywhere in the UI.** The Decentraland Unity explorer ships no emoji
glyphs, so an emoji renders as a missing-glyph box on the mobile client while
looking fine in preview. Mood identity is carried by **colour plus a plain-ASCII
glyph** (`~`, `:)`, `+`, `!`, `<3`, `?`). This is the single most common way a
Decentraland UI looks broken on mobile only.

**Every label has an explicit width and height.** Bevy measures intrinsic text
size; Unity treats an unset dimension as ~0 while still drawing the glyphs, which
makes stacked labels overlap and their parents collapse. Explicit boxes render
identically on both.

**Native controls decluttered.** The four numbered gamepad buttons and the
crosshair are hidden, which also removes the "+" overflow button. The joystick
stays — walking over to another player is the core of the game.

**Performance.** Zero 3D model files and zero textures: the entire scene is
primitives and flat colours. Total deployable payload is about **2.8 MB**, of
which 1.6 MB is the ambient music track. The production bundle is ~516 KB.
32 scene entities, 16 materials, three small particle emitters capped at 60
particles each.

---

## Architecture

The same bundle runs on the client and on the headless **Multiplayer Server**;
`isServer()` picks the branch.

```
src/
├── index.ts                    entry, isServer() branch
├── shared/                     imported by BOTH sides - no engine-only imports
│   ├── config.ts               every tunable number, single source of truth
│   ├── types.ts                enums and interfaces
│   ├── emotions.ts             mood table, combo rules, daily rotation
│   ├── scoring.ts              score maths (client previews, server pays)
│   ├── schemas.ts              synced components + validateBeforeChange
│   └── messages.ts             registerMessages protocol
├── server/                     SERVER ONLY, dynamically imported
│   ├── index.ts                bootstrap, payouts, heartbeat, checkpoints
│   ├── circles.ts              circle lifecycle + mini-game judging
│   ├── leaderboard.ts          ranked board, published to all clients
│   ├── dailyRotation.ts        featured mood + streak rules
│   ├── persistence.ts          Storage reads/writes at checkpoints only
│   └── state.ts                in-memory player registry
└── client/
    ├── index.ts                bootstrap, message handlers, per-frame tick
    ├── circle.ts               pad proximity, intents, derived views
    ├── emotions.ts             local mood assignment and reroll
    ├── practice.ts             solo trainer (unscored)
    ├── visuals.ts              pad colours, beacons, signs, particles
    ├── audio.ts                ambient bed + cues, mute toggle
    ├── miniGames/              the three games, panels + input routing
    ├── ui/                     React-ECS screens
    ├── mobile/                 safe-area metrics, touch control tuning
    └── utils/                  platform, server clock, invite links
```

### The server is authoritative

Clients send **intents**, never outcomes. There is no message a client can send
that contains a score, a hit count or a success flag.

- Every synced component is locked with `validateBeforeChange` to server-only
  writes (`senderAddress === AUTH_SERVER_PEER_ID`).
- Player positions are read by the server from `PlayerIdentityData` + `Transform`,
  never taken from the client. The "am I on a pad" check the client renders is a
  *hint*; the server recomputes it and the nearest pad wins if they disagree.
- Rhythm Tap taps are judged against the server's own beat grid using the time the
  tap *arrived*. A client can say "I tapped" but not "when".
- A member can only score each beat once, so mashing gains nothing.
- Rerolling a mood mid-circle is rejected, so nobody can see the combo and then
  fish for the featured multiplier.

### Notable implementation details

**The hold is a keepalive, not a latch.** `onMouseUp` can be missed if a thumb
slides off the button. If a hold were latched, that would both leave the input
stuck *and* let a player pass Hold Zones without holding. Instead the client
re-asserts its hold every 350ms and the server drops any hold it has not heard
from in 900ms. Silence means released.

**Clock alignment.** `startsAt`/`endsAt` are stamped with the *server's* clock. A
client whose wall clock is off by a few hundred ms would see the Rhythm Tap pulse
drift out of phase with the beats being judged. The client estimates the offset
from the heartbeat and renders in its own clock domain. The reading is late by
roughly one-way latency, which biases taps early — and the tap then spends another
one-way latency travelling back, so the errors largely cancel.

**Server liveness is tracked by observation, not by timestamp.** The client records
the *local* time at which the heartbeat value was seen to **change**. A CRDT
snapshot can carry a stale tick from a previous server run, which would read as
"alive" if the value were trusted. This also makes clock skew irrelevant. Cold
starts take ~15 seconds in production, so this surfaces an honest "waking up"
message rather than silently buffering.

**Atomic component split.** `CircleCore` (roster, game, combo) and `CircleProgress`
(progress, hits, masks) sit on the same entity as separate components, because
every component change re-sends the *whole* component. A progress tick is a few
bytes instead of the full member list.

**Sync id discipline.** Singletons get stable explicit ids. The three pads reuse
three persistent entities that cycle through phases forever, rather than being
created and destroyed per round — which avoids the "id provided is already in use"
failure of a same-frame remove-and-recreate. Per-player entities use
**auto-allocated** ids and are matched on a `playerId` field, because an id hashed
from a wallet address collides both between players and with a player's own stale
entity on reconnect.

**Storage writes are capped.** The runtime caps in-flight host calls and a
`Storage.set` past that cap fails *silently* (it resolves `false`, it does not
throw). So live state stays in memory and writes happen only at checkpoints: a
player leaves, a 20-second debounce elapses, or the board actually changed. Every
write result is checked.

**Graceful degradation.** If the leaderboard cannot be read from Storage, players
start from a blank profile and can still play — verified: the first run logs a 404
for the not-yet-existing key and continues. Missing composite entities are logged
and substituted rather than throwing.

---

## Running it locally

Requires **Node 18+** and Python 3 (only to regenerate the scene layout).

```bash
npm install
npm start
```

> This project uses the `@dcl/sdk@auth-server` branch, not the stock SDK. That
> branch is what provides the Multiplayer Server APIs (`isServer`, `Storage`,
> `registerMessages`). `npm install` picks it up from `package.json` — do not
> "upgrade" to `@dcl/sdk@latest` or the server half of the game stops existing.

`npm start` builds the scene, starts the preview server, and launches a local
headless Multiplayer Server alongside it.

### Testing multiplayer locally

Mood Match needs two players to do anything, so you need two clients.

**Browser, no install required** — this is the easiest route:

```bash
npm run start:web
```

That prints and opens a URL of the form:

```
https://decentraland.org/bevy-web/?preview=true&realm=http://127.0.0.1:8000&position=0,0
```

Open that **same URL in a second browser window** (use a different profile, or one
normal window plus one incognito) and you have two independent players. Walk both
into the same pad and tap Form Circle on each.

> Chromium-based browsers gate websites from reaching localhost. When the browser
> asks to access apps on your device, click **Allow**. If the scene never loads and
> no prompt appeared, enable it manually at
> `chrome://settings/content/siteDetails?site=https%3A%2F%2Fdecentraland.org`
> then reload — the toggle is "Apps on device" (Chrome 145+) or
> "Local network access" (Chrome 142-144).

**Desktop Client** — richer, but needs an install from
[dcl.gg/explorer](https://dcl.gg/explorer). Once installed, plain `npm start`
launches it via a `decentraland://` deep link, and `--multi-instance` allows a
second copy:

```bash
npm start -- --multi-instance
```

Without the Desktop Client installed, that deep link fails with
`kLSApplicationNotFoundErr` — nothing claims the `decentraland://` URL scheme.
Use `npm run start:web` instead.

### Testing on a phone

```bash
npm run start:phone
```

This prints a QR code in the terminal. Scan it with the **Decentraland mobile app**
on a phone connected to the **same WiFi** as your machine — the QR points at your
LAN address, not localhost, so a phone on cellular data cannot reach it.

### Other commands

| Command | What it does |
|---|---|
| `npm run check` | Runs 51 assertions over the combo table, rotation, streaks and score maths |
| `npm run build` | Dev build + typecheck |
| `npm run build:production` | Production build, no sourcemaps |
| `npm run verify` | `check` + `build` |
| `npm run composite` | Regenerates `assets/scene/main.composite` from the layout config |
| `npm run server-logs` | Tails production Multiplayer Server logs |

### Tuning the game

Every gameplay number lives in [`src/shared/config.ts`](src/shared/config.ts) —
pad positions, proximity radius, mini-game durations and thresholds, all point
values, throttles. Client and server both read it, so they cannot disagree about
the rules.

If you change `PAD_POSITIONS`, mirror it in `tools/build-composite.py` and run
`npm run composite`. CI fails if the committed composite is out of sync.

---

## Deploying

Mood Match deploys to a **Decentraland World**, which needs a Decentraland NAME or
an ENS domain owned by the signing wallet. Check what you own at
[decentraland.org/builder/names](https://decentraland.org/builder/names).

```bash
./deploy.sh your-name.dcl.eth
```

That script checks the game rules, does a production build, reports the payload
size, and publishes. A browser window opens for you to sign.

For CI, set a `DCL_PRIVATE_KEY` repository secret and run the
**Deploy to Decentraland World** workflow from the Actions tab. It is manual on
purpose — an accidental deploy takes the live World down for the asset conversion
window.

> After publishing, allow **30-60 minutes** before the new version is reliably
> playable. 3D assets are converted server-side after each deploy.

---

## Honest status

What has been verified:

- Production build and typecheck pass with zero errors.
- The headless Multiplayer Server boots, initialises, publishes the daily
  rotation, and ticks for minutes without errors or log noise.
- Storage-miss path handled gracefully on a cold first run.
- 51 assertions over the combo table, daily rotation, streak curve, skin bitmask
  and score arithmetic pass, including that payouts are always integers and the
  itemised breakdown reconciles to the total.
- Payload measured at ~2.8 MB deployable, ~516 KB bundle.

What has **not** been verified, and should be before submitting:

- **Play-testing with 2-4 real players.** The circle formation, mini-game judging
  and payout paths have not been exercised end to end by real clients. This is the
  most important remaining test.
- **A real mobile device.** The layout follows the documented safe-area and
  touch-target rules and avoids the known Unity text and emoji traps, but it has
  not been looked at on an actual phone. Text sizes and the bottom-centre action
  placement should be checked on a small screen.
- **Frame rate on a mid-range phone.** The scene is deliberately tiny (primitives
  only, no textures), but this is unmeasured.
- **A production cold start.** Local preview starts the server instantly, which is
  exactly why cold-start bugs escape to production. The 15-second wake path needs
  testing against a real deploy with nobody else in the World.

---

## Buildathon checklist

- [x] Meaningful social interaction — cooperative by construction, unscoreable alone
- [x] Persistent standalone experience — no host, no scheduled events, server wakes on demand
- [x] Mobile-first design — safe areas, large touch targets, no emoji, no textures
- [x] Open source — MIT, full source in this repo
- [x] README with setup and gameplay instructions
- [x] Original concept
- [ ] Deployed to a publicly accessible World *(set your NAME and run `./deploy.sh`)*
- [ ] Tested on iOS and Android
- [ ] Submitted to DoraHacks

---

## License

[MIT](LICENSE). Audio from the official Decentraland Creator Hub free asset packs.

Built with the [Decentraland SDK7](https://docs.decentraland.org) and the
official [SDK skills](https://github.com/decentraland/sdk-skills).
