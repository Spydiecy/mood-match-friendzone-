/**
 * Mood Match - mini-game router.
 *
 * Picks the right panel and input row for whichever game the server chose. The
 * same three panels serve both real circles and solo practice, because both are
 * projected into a `RoundView` first.
 */

import ReactEcs from '@dcl/sdk/react-ecs'
import { MINIGAME_COUNT, MiniGameKind } from '../../shared/types'

/** Every mini-game, for the practice picker. */
export const ALL_MINI_GAMES: MiniGameKind[] = Array.from(
  { length: MINIGAME_COUNT },
  (_unused, index) => index as MiniGameKind
)
import { COLOR_MATCH_BRIEF, ColorMatchAction, ColorMatchPanel } from './colorMatch'
import { HOLD_ZONES_BRIEF, HoldZonesAction, HoldZonesPanel } from './holdZones'
import { RHYTHM_TAP_BRIEF, RhythmTapAction, RhythmTapPanel } from './rhythmTap'
import { SYNC_TAP_BRIEF, SyncTapAction, SyncTapPanel } from './syncTap'
import { TAP_RACE_BRIEF, TapRaceAction, TapRacePanel } from './tapRace'
import { REACTION_BRIEF, ReactionAction, ReactionPanel } from './reaction'
import { RoundView } from './round'

/**
 * True when the round has an individual winner.
 *
 * Sync Tap is the only round that does not: every member scores identically by
 * design, so ranking it would be arbitrary.
 */
export function isCompetitive(game: MiniGameKind): boolean {
  return game !== MiniGameKind.SyncTap
}

/** Player-facing name of a mini-game. ASCII only. */
export function miniGameName(game: MiniGameKind): string {
  switch (game) {
    case MiniGameKind.RhythmTap:
      return 'Rhythm Tap'
    case MiniGameKind.HoldZones:
      return 'Hold Zones'
    case MiniGameKind.ColorMatch:
      return 'Color Match'
    case MiniGameKind.SyncTap:
      return 'Sync Tap'
    case MiniGameKind.TapRace:
      return 'Tap Race'
    case MiniGameKind.Reaction:
      return 'Reaction'
    default:
      return 'Mini Game'
  }
}

/** One-line brief, shown during the countdown so nobody starts confused. */
export function miniGameBrief(game: MiniGameKind): string {
  switch (game) {
    case MiniGameKind.RhythmTap:
      return RHYTHM_TAP_BRIEF
    case MiniGameKind.HoldZones:
      return HOLD_ZONES_BRIEF
    case MiniGameKind.ColorMatch:
      return COLOR_MATCH_BRIEF
    case MiniGameKind.SyncTap:
      return SYNC_TAP_BRIEF
    case MiniGameKind.TapRace:
      return TAP_RACE_BRIEF
    case MiniGameKind.Reaction:
      return REACTION_BRIEF
    default:
      return ''
  }
}

/** The centre visual for the active round. */
export function MiniGamePanel(props: { round: RoundView }) {
  switch (props.round.game) {
    case MiniGameKind.HoldZones:
      return <HoldZonesPanel round={props.round} />
    case MiniGameKind.ColorMatch:
      return <ColorMatchPanel round={props.round} />
    case MiniGameKind.SyncTap:
      return <SyncTapPanel round={props.round} />
    case MiniGameKind.TapRace:
      return <TapRacePanel round={props.round} />
    case MiniGameKind.Reaction:
      return <ReactionPanel round={props.round} />
    case MiniGameKind.RhythmTap:
    default:
      return <RhythmTapPanel round={props.round} />
  }
}

/** The bottom-centre input row for the active round. */
export function MiniGameAction(props: { round: RoundView }) {
  switch (props.round.game) {
    case MiniGameKind.HoldZones:
      return <HoldZonesAction round={props.round} />
    case MiniGameKind.ColorMatch:
      return <ColorMatchAction round={props.round} />
    case MiniGameKind.SyncTap:
      return <SyncTapAction round={props.round} />
    case MiniGameKind.TapRace:
      return <TapRaceAction round={props.round} />
    case MiniGameKind.Reaction:
      return <ReactionAction round={props.round} />
    case MiniGameKind.RhythmTap:
    default:
      return <RhythmTapAction round={props.round} />
  }
}
