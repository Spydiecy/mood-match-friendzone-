/**
 * Mood Match - mini-game router.
 *
 * Picks the right panel and input row for whichever game the server chose. The
 * same three panels serve both real circles and solo practice, because both are
 * projected into a `RoundView` first.
 */

import ReactEcs from '@dcl/sdk/react-ecs'
import { MiniGameKind } from '../../shared/types'
import { COLOR_MATCH_BRIEF, ColorMatchAction, ColorMatchPanel } from './colorMatch'
import { HOLD_ZONES_BRIEF, HoldZonesAction, HoldZonesPanel } from './holdZones'
import { RHYTHM_TAP_BRIEF, RhythmTapAction, RhythmTapPanel } from './rhythmTap'
import { RoundView } from './round'

/** Player-facing name of a mini-game. ASCII only. */
export function miniGameName(game: MiniGameKind): string {
  switch (game) {
    case MiniGameKind.RhythmTap:
      return 'Rhythm Tap'
    case MiniGameKind.HoldZones:
      return 'Hold Zones'
    case MiniGameKind.ColorMatch:
      return 'Color Match'
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
    case MiniGameKind.RhythmTap:
    default:
      return <RhythmTapAction round={props.round} />
  }
}
