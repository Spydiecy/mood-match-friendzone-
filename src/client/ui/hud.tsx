/**
 * Mood Match - the main HUD.
 *
 * Layout principles, all learned from looking at it on an actual phone:
 *
 *  1. THE CENTRE OF THE SCREEN STAYS EMPTY unless a round is running. The
 *     interesting thing to look at is the other players, and an idle status panel
 *     parked in the middle buried the entire world. Status lives in a slim strip
 *     at the top instead.
 *  2. Everything sits in the 720-high budget from `theme.ts`: a ~92px top strip, a
 *     centre stage that only appears during a round, and a ~196px action row.
 *  3. `screenInset: 'interactable'` already clears the notch, minimap, chat and
 *     left-side controls. What it does NOT clear is the mobile client's own action
 *     buttons over the bottom-right, so the action column is centred and kept
 *     narrow enough to stay clear of both the joystick and those buttons.
 *  4. Buttons carry generated PNG icons plus a short caption. Emoji are not an
 *     option (no glyphs on the Unity explorer) and icon-only controls are
 *     guesswork on first use.
 */

import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { MIN_CIRCLE_PLAYERS } from '../../shared/config'
import { getEmotion } from '../../shared/emotions'
import { CirclePhase } from '../../shared/types'
import {
  PAD_NAMES,
  PAD_REQUIRED,
  PAD_WHERE,
  padFill,
  padFillFor,
  pingPlaza,
  waitingElsewhere
} from '../circle'
import { MiniGameAction, MiniGamePanel, miniGameBrief, miniGameName } from '../miniGames'
import { roundFromPad, roundFromPractice } from '../miniGames/round'
import { practiceBest, startPractice, stopPractice } from '../practice'
import { state } from '../state'
import {
  BUDGET,
  COLORS,
  FONT,
  ICON,
  RADIUS,
  SPACE,
  TOUCH,
  emotionColor,
  emotionShade,
  textHeight,
  toneColor
} from './theme'
import {
  EmotionBadge,
  Icon,
  IconButton,
  Panel,
  PrimaryButton,
  ProgressBar,
  Row,
  StatChip,
  Text
} from './widgets'

/* -------------------------------------------------------------------------- */
/* Top strip                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * One slim row carrying everything the player needs at a glance: their mood, their
 * numbers, and what to do next.
 *
 * The "what to do next" used to be a large centred panel. Merging it in here is
 * what freed the middle of the screen.
 */
export function TopBar() {
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: BUDGET.topStrip,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: { top: SPACE.sm }
      }}
    >
      <MoodChip />
      <StatsChip />
      <StatusChip />
    </UiEntity>
  )
}

/** The player's mood identity, compact. */
function MoodChip() {
  const emotion = getEmotion(state.emotion)
  const isFeatured = state.emotion === state.featuredEmotion

  return (
    <UiEntity
      uiTransform={{
        width: 208,
        height: 76,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: { left: SPACE.sm, right: SPACE.sm },
        borderRadius: RADIUS.panel,
        borderWidth: 2,
        borderColor: emotionColor(state.emotion),
        margin: { right: SPACE.sm }
      }}
      uiBackground={{ color: emotionShade(state.emotion, 0.95) }}
    >
      <EmotionBadge emotion={state.emotion} size={52} />
      <UiEntity
        uiTransform={{
          width: 132,
          height: 66,
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: { left: SPACE.sm }
        }}
      >
        <Text
          value={emotion.name}
          fontSize={FONT.heading}
          color={COLORS.text}
          align="middle-left"
        />
        {/* Single line, nowrap. The two-line version clipped on a phone. */}
        <Text
          value={isFeatured ? 'x2 today' : 'mood'}
          fontSize={FONT.tiny}
          color={isFeatured ? COLORS.good : COLORS.textDim}
          align="middle-left"
        />
      </UiEntity>
    </UiEntity>
  )
}

/** Score, rank and streak. */
function StatsChip() {
  return (
    <UiEntity
      uiTransform={{
        width: 268,
        height: 76,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: RADIUS.panel,
        margin: { right: SPACE.sm }
      }}
      uiBackground={{ color: COLORS.panel }}
    >
      <StatChip label="Score" value={String(state.score)} />
      <StatChip
        label="Rank"
        value={state.rank > 0 ? `#${state.rank}` : '-'}
        color={state.rank === 1 ? COLORS.warn : COLORS.text}
      />
      <StatChip
        label="Streak"
        value={`${state.streakDays}d`}
        color={state.streakDays > 1 ? COLORS.good : COLORS.text}
      />
    </UiEntity>
  )
}

/**
 * What to do next, in one line.
 *
 * This replaced a full centre-screen panel. It always answers "where do I go" and
 * "who is already there", which is the information a social game cannot afford to
 * hide - but it does so in 76px of height instead of 300.
 */
function StatusChip() {
  const guidance = currentGuidance()

  return (
    <UiEntity
      uiTransform={{
        width: 470,
        height: 76,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: { left: SPACE.md, right: SPACE.md },
        borderRadius: RADIUS.panel,
        borderWidth: guidance.urgent ? 2 : 0,
        borderColor: guidance.urgent ? COLORS.good : COLORS.none
      }}
      uiBackground={{ color: COLORS.panel }}
    >
      <Text
        value={guidance.headline}
        fontSize={FONT.body}
        color={guidance.urgent ? COLORS.good : COLORS.text}
      />
      <Text value={guidance.detail} fontSize={FONT.tiny} color={COLORS.textDim} />
    </UiEntity>
  )
}

/** The current one-line instruction. */
function currentGuidance(): { headline: string; detail: string; urgent: boolean } {
  const fill = padFill()
  const elsewhere = waitingElsewhere()

  if (fill) {
    const needed = Math.max(0, fill.required - fill.here)
    return {
      headline: `${PAD_NAMES[fill.padIndex]}  ${fill.here}/${fill.required}`,
      detail:
        needed === 0
          ? 'Starting now'
          : state.playersOnline > 1
            ? `Need ${needed} more - your avatar is waving`
            : `Need ${needed} more - tap Call to ping the World`,
      urgent: fill.here > 0
    }
  }

  if (elsewhere) {
    return {
      headline: `${elsewhere.count} waiting at the ${PAD_NAMES[elsewhere.padIndex]}`,
      detail: `Walk over - it needs ${PAD_REQUIRED[elsewhere.padIndex]}`,
      urgent: true
    }
  }

  return {
    headline: 'Stand in a Mood Pad',
    detail: `${state.playersOnline} here now - circles start on their own`,
    urgent: false
  }
}

/* -------------------------------------------------------------------------- */
/* Centre stage - only during a round                                         */
/* -------------------------------------------------------------------------- */

/**
 * The middle of the screen.
 *
 * Returns a 1x1 nothing when idle, on purpose. Every pixel spent here is a pixel
 * of the world and of other players that the player cannot see.
 */
export function CenterStage() {
  const pad = state.myPad

  if (pad && pad.phase !== CirclePhase.Result) return <ActiveRound />
  if (pad && pad.phase === CirclePhase.Result) return <RoundResult />
  if (state.practice) return <PracticeRound />
  if (state.payout) return <PayoutPanel />

  return <UiEntity uiTransform={{ width: 1, height: 1 }} />
}

/** A live, server-judged round. */
function ActiveRound() {
  const pad = state.myPad
  if (!pad) return <UiEntity uiTransform={{ width: 1, height: 1 }} />

  const round = roundFromPad(pad)
  const counting = pad.phase === CirclePhase.Countdown

  return (
    <Panel width={780} maxHeight={BUDGET.centreMax} padding={SPACE.md} textured>
      <Row width="100%" justifyContent="center">
        <Text
          value={`${miniGameName(pad.game)}  -  ${PAD_NAMES[pad.padIndex]}  ${pad.members.length}/${pad.required}`}
          fontSize={FONT.heading}
          color={COLORS.text}
          width={620}
        />
      </Row>

      <Text
        value={
          pad.comboBonus > 0
            ? `${pad.comboName}  +${pad.comboBonus}`
            : 'No combo bonus - the circle still scores'
        }
        fontSize={FONT.tiny}
        color={pad.comboBonus > 0 ? COLORS.good : COLORS.textDim}
        width={620}
      />

      {counting ? (
        <Text
          value={miniGameBrief(pad.game)}
          fontSize={FONT.small}
          color={COLORS.textDim}
          width={720}
          wrap
          lines={2}
        />
      ) : (
        false
      )}

      <MiniGamePanel round={round} />
    </Panel>
  )
}

/** The moment after a round, before the itemised payout arrives. */
function RoundResult() {
  const pad = state.myPad
  if (!pad) return <UiEntity uiTransform={{ width: 1, height: 1 }} />

  const mine = pad.myIndex >= 0 ? pad.points[pad.myIndex] ?? 0 : 0

  return (
    <Panel
      width={620}
      maxHeight={BUDGET.centreMax}
      padding={SPACE.lg}
      borderWidth={3}
      borderColor={pad.success ? COLORS.good : COLORS.warn}
      textured
    >
      <Row width="100%" justifyContent="center">
        <Icon
          src={pad.success ? ICON.check : ICON.info}
          size={34}
          color={pad.success ? COLORS.good : COLORS.warn}
        />
        <Text
          value={pad.success ? 'Circle cleared' : 'Circle held'}
          fontSize={FONT.title}
          color={pad.success ? COLORS.good : COLORS.warn}
          width={420}
        />
      </Row>
      <Text
        value={`+${mine} points`}
        fontSize={FONT.hero}
        color={COLORS.text}
        width={420}
      />
      <Row width="100%" justifyContent="center" marginTop={SPACE.sm}>
        {pad.members.map((address, index) => (
          <EmotionBadge key={address} emotion={pad.memberEmotions[index] ?? 0} size={44} />
        ))}
      </Row>
    </Panel>
  )
}

/** A solo practice run. Clearly labelled as unscored. */
function PracticeRound() {
  const practice = state.practice
  if (!practice) return <UiEntity uiTransform={{ width: 1, height: 1 }} />

  const round = roundFromPractice(practice, state.emotion)
  const best = practiceBest(practice.game)

  return (
    <Panel
      width={780}
      maxHeight={BUDGET.centreMax}
      padding={SPACE.md}
      borderWidth={2}
      borderColor={COLORS.warn}
      textured
    >
      <Row width="100%" justifyContent="center">
        <Icon src={ICON.practice} size={26} color={COLORS.warn} />
        <Text
          value={`Practice  -  ${miniGameName(practice.game)}`}
          fontSize={FONT.heading}
          color={COLORS.warn}
          width={560}
        />
      </Row>
      <Text
        value={
          best > 0
            ? `Unscored  -  your best here is ${Math.round(best * 100)}%`
            : 'Unscored  -  real circles need 2 or more players'
        }
        fontSize={FONT.tiny}
        color={COLORS.textDim}
        width={700}
      />
      <MiniGamePanel round={round} />
    </Panel>
  )
}

/** The itemised payout, matching the server's own arithmetic line for line. */
function PayoutPanel() {
  const payout = state.payout
  if (!payout) return <UiEntity uiTransform={{ width: 1, height: 1 }} />

  const streakPercent = Math.round(payout.streakBonus * 100)

  return (
    <Panel
      width={560}
      maxHeight={BUDGET.centreMax}
      padding={SPACE.lg}
      borderWidth={3}
      borderColor={COLORS.good}
      textured
    >
      <Text value="Points earned" fontSize={FONT.heading} color={COLORS.text} width={460} />
      <Text value={`+${payout.total}`} fontSize={FONT.hero} color={COLORS.good} width={400} />

      <PayoutLine label="Circle formed" value={`+${payout.base}`} />
      {payout.combo > 0 && <PayoutLine label="Emotion combo" value={`+${payout.combo}`} />}
      {payout.miniGame > 0 && (
        <PayoutLine label="Mini-game cleared" value={`+${payout.miniGame}`} />
      )}
      {payout.groupSize > 0 && (
        <PayoutLine label="Bigger circle" value={`+${payout.groupSize}`} />
      )}
      {payout.featuredMultiplier > 1 && (
        <PayoutLine label="Featured mood" value={`x${payout.featuredMultiplier}`} />
      )}
      {streakPercent > 0 && <PayoutLine label="Streak bonus" value={`+${streakPercent}%`} />}

      <Text
        value={`Total ${payout.newScore}   rank #${payout.rank}`}
        fontSize={FONT.small}
        color={COLORS.textDim}
        width={460}
        marginTop={SPACE.sm}
      />

      {payout.unlockedSkin >= 0 && (
        <Text
          value={`Unlocked: ${getEmotion(payout.unlockedSkin).name} skin`}
          fontSize={FONT.small}
          color={COLORS.warn}
          width={460}
        />
      )}
    </Panel>
  )
}

/** One row of the payout breakdown. */
function PayoutLine(props: { label: string; value: string }) {
  return (
    <UiEntity
      uiTransform={{
        width: 440,
        height: textHeight(FONT.small) + 4,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}
    >
      <Text
        value={props.label}
        fontSize={FONT.small}
        color={COLORS.textDim}
        align="middle-left"
        width={300}
      />
      <Text
        value={props.value}
        fontSize={FONT.small}
        color={COLORS.text}
        align="middle-right"
        width={120}
      />
    </UiEntity>
  )
}

/* -------------------------------------------------------------------------- */
/* Bottom action row                                                          */
/* -------------------------------------------------------------------------- */

/** The bottom-centre controls. Never the bottom-right - see the file header. */
export function ActionRow() {
  const pad = state.myPad

  if (pad && pad.phase !== CirclePhase.Result) {
    return (
      <ActionColumn>
        <MiniGameAction round={roundFromPad(pad)} />
      </ActionColumn>
    )
  }

  if (state.practice) {
    const practice = state.practice
    return (
      <ActionColumn>
        {!practice.finished && (
          <MiniGameAction round={roundFromPractice(practice, state.emotion)} />
        )}
        <Row width="100%" justifyContent="center" marginTop={SPACE.sm}>
          <IconButton icon={ICON.close} caption="Exit" onClick={() => stopPractice()} />
        </Row>
      </ActionColumn>
    )
  }

  return (
    <ActionColumn>
      <PrimaryAction />
      <Row width="100%" justifyContent="center" marginTop={SPACE.sm}>
        <IconButton
          icon={ICON.board}
          caption="Board"
          onClick={() => {
            state.screen = 'leaderboard'
          }}
        />
        {/*
          The most useful button when the plaza is empty: it tells everyone in the
          World that somebody is here and waiting. Highlighted while waiting.
        */}
        <IconButton
          icon={ICON.call}
          caption="Call"
          onClick={() => pingPlaza()}
          active={state.waiting}
          background={state.waiting ? COLORS.surface : COLORS.chip}
        />
        <IconButton
          icon={ICON.practice}
          caption="Practice"
          onClick={() => startPractice()}
        />
        <IconButton
          icon={ICON.info}
          caption="Info"
          onClick={() => {
            state.screen = 'info'
          }}
        />
      </Row>
    </ActionColumn>
  )
}

/**
 * Fixed-height container for the bottom controls.
 *
 * Width-capped at 470 and centred, so it stays clear of the joystick on the left
 * and the client's action buttons on the right.
 */
function ActionColumn(props: {
  children?: ReactEcs.JSX.Element | ReactEcs.JSX.Element[] | (ReactEcs.JSX.Element | false)[]
}) {
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: BUDGET.actionRow,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-end',
        padding: { bottom: SPACE.md }
      }}
    >
      <UiEntity
        uiTransform={{
          width: 470,
          height: 'auto',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-end'
        }}
      >
        {props.children}
      </UiEntity>
    </UiEntity>
  )
}

/**
 * The main readout at the bottom.
 *
 * NOT a button any more. Circles fill automatically from presence, so this shows
 * how full the ring is - the counter and the bar are the feedback that the old
 * Form Circle button was failing to give. When the player is not on a pad it lists
 * the three pads and what each needs, so there is never a question of where to go.
 */
function PrimaryAction() {
  if (state.myPad && state.myPad.phase === CirclePhase.Result) {
    return (
      <PrimaryButton
        label="Round complete"
        sublabel="The pad reopens in a moment"
        onClick={() => {}}
        disabled
      />
    )
  }

  const fill = padFill()
  if (fill) return <FillMeter here={fill.here} required={fill.required} padIndex={fill.padIndex} />

  return <PadDirectory />
}

/**
 * The fill counter, in the style of a lobby: "2/3" with a segment per slot.
 *
 * Segments rather than a plain bar because the counts are tiny (2 to 4) and
 * discrete slots read instantly at a glance, where a continuous bar does not.
 */
function FillMeter(props: { here: number; required: number; padIndex: number }) {
  const full = props.here >= props.required
  const accent = full ? COLORS.good : emotionColor(state.emotion)

  return (
    <UiEntity
      uiTransform={{
        width: TOUCH.primaryWidth,
        height: TOUCH.primaryHeight,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: RADIUS.pill,
        borderWidth: 3,
        borderColor: accent
      }}
      uiBackground={{ color: COLORS.panel }}
    >
      <Text
        value={
          full
            ? 'Starting'
            : `${PAD_NAMES[props.padIndex]}  ${props.here}/${props.required}`
        }
        fontSize={FONT.heading}
        color={full ? COLORS.good : COLORS.text}
      />
      <Row width="100%" justifyContent="center">
        {slots(props.required).map((slot) => (
          <UiEntity
            key={`slot-${slot}`}
            uiTransform={{
              width: Math.round(240 / props.required),
              height: 10,
              borderRadius: RADIUS.pill,
              margin: { left: 3, right: 3, top: 3 }
            }}
            uiBackground={{ color: slot < props.here ? accent : COLORS.chip }}
          />
        ))}
      </Row>
    </UiEntity>
  )
}

/** [0, 1, ... n-1] */
function slots(n: number): number[] {
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push(i)
  return out
}

/**
 * The three pads and their live occupancy, shown when the player is not on one.
 *
 * Answers "where do I go" with real numbers rather than prose, which matters most
 * in a quiet plaza where the answer is "the Duo pad, because it only needs two".
 */
function PadDirectory() {
  return (
    <UiEntity
      uiTransform={{
        width: 470,
        height: TOUCH.primaryHeight,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: RADIUS.panel
      }}
      uiBackground={{ color: COLORS.panel }}
    >
      {PAD_NAMES.map((name, index) => {
        const fill = padFillFor(index)
        const active = fill.here > 0
        return (
          <UiEntity
            key={`dir-${index}`}
            uiTransform={{
              width: 150,
              height: 74,
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: RADIUS.chip,
              borderWidth: active ? 2 : 0,
              borderColor: active ? COLORS.good : COLORS.none,
              margin: { left: 2, right: 2 }
            }}
            uiBackground={{ color: active ? COLORS.surface : COLORS.chip }}
          >
            <Text
              value={`${fill.here}/${fill.required}`}
              fontSize={FONT.heading}
              color={active ? COLORS.good : COLORS.text}
            />
            <Text
              value={`${name.replace(' Pad', '')} - ${PAD_WHERE[index]}`}
              fontSize={FONT.tiny}
              color={COLORS.textDim}
            />
          </UiEntity>
        )
      })}
    </UiEntity>
  )
}

/* -------------------------------------------------------------------------- */
/* Overlays                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A transient toast, just under the top strip.
 *
 * Carries no pointer handler on purpose: a toast that swallowed taps would block
 * the game for as long as it was visible.
 */
export function NoticeToast() {
  const notice = state.notice
  if (!notice) return <UiEntity uiTransform={{ width: 1, height: 1 }} />

  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: 52,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        margin: { top: SPACE.xs }
      }}
    >
      <UiEntity
        uiTransform={{
          width: 700,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: RADIUS.pill,
          borderWidth: 2,
          borderColor: toneColor(notice.tone)
        }}
        uiBackground={{ color: COLORS.panel }}
      >
        <Text value={notice.text} fontSize={FONT.small} color={COLORS.text} />
      </UiEntity>
    </UiEntity>
  )
}

/**
 * Connection state banner.
 *
 * Two genuinely different failures, shown differently. Room-not-synced is
 * transient (about a second on load). Server-not-alive can mean a 15-second cold
 * start, or a server nobody has woken - so that gets an explicit message rather
 * than a silent wait.
 */
export function ConnectionBanner() {
  if (state.serverAlive && state.roomReady) {
    return <UiEntity uiTransform={{ width: 1, height: 1 }} />
  }

  const message = !state.roomReady
    ? 'Connecting to the plaza...'
    : 'Waking the server - up to 15 seconds on a quiet day'

  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        margin: { top: SPACE.xs }
      }}
    >
      <UiEntity
        uiTransform={{
          width: 640,
          height: 40,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: RADIUS.pill,
          borderWidth: 2,
          borderColor: COLORS.warn
        }}
        uiBackground={{ color: COLORS.panel }}
      >
        <Text value={message} fontSize={FONT.tiny} color={COLORS.warn} />
      </UiEntity>
    </UiEntity>
  )
}

/** Kept for the progress bar import, used by the waiting indicator below. */
export function WaitingProgress() {
  if (!state.waiting) return <UiEntity uiTransform={{ width: 1, height: 1 }} />
  const pad = state.nearestPad >= 0 ? state.pads[state.nearestPad] : undefined
  const here = pad && pad.phase === CirclePhase.Gathering ? pad.members.length : 0

  return (
    <UiEntity uiTransform={{ width: 320, height: 16, margin: { top: SPACE.xs } }}>
      <ProgressBar
        value={Math.min(1, here / MIN_CIRCLE_PLAYERS)}
        fill={emotionColor(state.emotion)}
      />
    </UiEntity>
  )
}
