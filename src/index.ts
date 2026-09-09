/**
 * Mood Match - scene entry point.
 *
 * A cooperative, mobile-first social game for Decentraland. Players are given a
 * random emotion, gather on a Mood Pad with other players, and play a 10-second
 * cooperative mini-game together for points on a persistent leaderboard.
 *
 * Built for the Friendzone Mobile Buildathon.
 *
 * Architecture notes:
 *
 *  - The same bundle runs on the client and on the headless Multiplayer Server.
 *    `isServer()` picks the branch.
 *  - `./shared/schemas` and `./shared/messages` are imported STATICALLY because
 *    both define components during module load, which must happen before the
 *    engine seals. A dynamic `import()` of either would throw
 *    "Engine is already sealed".
 *  - `./server/index` is imported DYNAMICALLY inside the server branch so that
 *    `@dcl/sdk/server` never ends up in the client's code path.
 */

import { isServer } from '@dcl/sdk/network'

// Static, load-time imports: these define ECS components and register messages.
import { protectComponents } from './shared/schemas'
import './shared/messages'

import { startClient } from './client'

export function main(): void {
  // Lock every synced component to server-only writes. This is a no-op on the
  // client (the guard lives inside the function).
  protectComponents()

  if (isServer()) {
    // Dynamic import keeps the server-only `@dcl/sdk/server` dependency out of
    // the client path. Safe here because this module defines no components.
    import('./server')
      .then((serverModule) => serverModule.startServer())
      .catch((error) => console.log('[SERVER] failed to start:', error))
    return
  }

  startClient()
}
