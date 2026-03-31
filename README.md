# Orbeats

**Orbeats** is a real-time multiplayer 3D arena game inspired by Agar.io. Eat pellets and smaller players to grow, split to attack or escape, and stay alive before the 3-minute session resets the leaderboard.

🌐 **Play now:** [orbeats.online](https://orbeats.online)

---

## Gameplay

- **Move** – your orb follows your mouse cursor (or finger on mobile).
- **Eat pellets** – scattered across the arena, each pellet adds +1 mass. Special pellets add +10, rare pink diamonds add +100.
- **Eat other players** – you must be at least **5% larger** than your target to eat them.
- **Split (Space / double-tap)** – split your orb into two. Each half launches forward at speed. Blobs re-merge after ~8 seconds. You can chain-split up to **8 blobs**.
- **Mass decay** – above 2 000 mass, your orb slowly loses mass over time. The bigger you are, the faster you shrink. Stay aggressive.
- **3-minute session** – every room resets after 180 seconds. Scores reset for everyone simultaneously. Use the session timer (bottom-right) to plan your final push.

### Pellet types

| Type | Color | Mass bonus |
|---|---|---|
| Normal | Pink, blue, purple, orange… | +1 |
| Special | Magenta glow | +10 |
| Rare diamond | Rotating pink octahedron | +100 |

### Scoring

Score = total mass of all your blobs combined.  
Losing a split blob reduces your score immediately.  
Dying resets your score to base mass (10).

---

## Controls

| Action | Desktop | Mobile |
|---|---|---|
| Move | Mouse position | Touch drag |
| Split | `Space` | Double-tap |
| End game early | Hover timer → "End Game" | Tap ··· on timer |

---

## Session timer

The bottom-right pill shows remaining session time for your room.

- **Orange** = normal (> 30 s remaining)
- **Red** = last 30 seconds — time to push for a high score!
- On desktop, hovering the timer morphs it into an **End Game** button to exit early and trigger the score multiplier mini-game.

---

## Score multiplier mini-game

After each session ends (timer expires, eaten, or End Game), a timing mini-game appears:

```
| 1.0 | 1.2 | 1.4 | 1.6 | 1.4 | 1.2 | 1.0 |
             ↑ click here!
```

Stop the moving indicator at the highest zone to multiply your final score.  
The result is saved to **Top Scores Today**.

---

## Tech stack

| Layer | Technology |
|---|---|
| Client | Vite + TypeScript + Three.js |
| Server | Node.js + TypeScript + ws |
| Hosting (client) | Vercel |
| Hosting (server) | Fly.io |
| Shared types | npm workspace `@orbeats/shared` |

---

## Running locally

```bash
# 1. Install all workspaces from the repo root
npm install

# 2. Start both client (Vite :5173) and server (WS :3001) concurrently
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in multiple tabs to play together.

### Environment variables

| Variable | Where | Description |
|---|---|---|
| `VITE_WS_URL` | Vercel (client) | Optional; default prod fallback is `wss://orbeats.fly.dev/ws` |

---

## Deploying

**Client (Vercel)**  
Push to `main`. Vercel auto-deploys. Set `VITE_WS_URL` in Vercel → Project → Settings → Environment Variables.

**Server (Fly.io)**  
```bash
fly deploy
```

---

## Key constants (`shared/src/constants.ts`)

| Constant | Default | Purpose |
|---|---|---|
| `ARENA_SIZE` | 800 | World units; arena spans −400 → +400 |
| `PELLET_COUNT` | 4 000 | Target normal pellet density |
| `BASE_MASS` | 10 | Starting orb mass |
| `EAT_RATIO` | 1.05 | Must be 5% larger to eat |
| `BASE_SPEED` | 60 | World units/s at base mass |
| `SESSION_SECONDS` | 180 | Room session length (3 min) |
| `MAX_PLAYER_CELLS` | 8 | Max split blobs per player |
| `MASS_DECAY_THRESHOLD` | 2 000 | Decay starts above this mass |
| `MIN_BOT_COUNT` | 8 | Minimum AI opponents per room |

---

## Repo structure

```
Agar3D/
├── shared/src/
│   ├── constants.ts      # All game constants + math helpers
│   ├── types.ts          # Shared entity / pellet types
│   └── protocol.ts       # WS message type enums + interfaces
├── server/src/
│   ├── index.ts          # HTTP + WebSocket entry, security gates
│   ├── GameLoop.ts       # 20 Hz authoritative simulation
│   ├── security.ts       # IP limits, token-bucket rate limiter
│   └── scoreStorage.ts   # Score gate (min score, cooldown, dedupe)
└── client/src/
    ├── main.ts           # Orchestration entry point
    ├── core/
    │   ├── gameState.ts  # All mutable session/player state
    │   └── gameOver.ts   # Shared multiplier → save → death-panel flow
    ├── scene/
    │   ├── SceneManager.ts     # Three.js scene, camera, renderer, floor
    │   ├── PlayerMesh.ts       # Local player sphere
    │   ├── EnemyMesh.ts        # Enemy spheres + angry face sprite
    │   ├── PelletMesh.ts       # Event-driven per-pellet meshes
    │   └── MergeAnimManager.ts # Split-cell shrink animations
    ├── network/
    │   ├── Socket.ts           # WS connect + typed message handlers
    │   ├── Interpolation.ts    # 100 ms buffer for remote entities
    │   └── Prediction.ts       # Client-side dead-reckoning + reconciliation
    ├── input/
    │   ├── InputManager.ts     # Mouse/touch → direction vector
    │   └── DoubleTapSplit.ts   # Mobile double-tap gesture
    ├── ui/
    │   ├── HUD.ts              # Score badge, leaderboard, death overlay
    │   ├── MultiplierOverlay.ts # Post-session timing mini-game
    │   ├── SessionTimeline.ts  # Bottom-right timer pill + End Game morph
    │   ├── ScoreManager.ts     # localStorage best score + daily top scores
    │   └── JoinScreen.ts       # Join screen DOM wiring
    └── integrations/
        └── analytics.ts        # Vercel Web Analytics mount
```
