/**
 * Mood Match - the main HUD.
 *
 * Layout rules that drive every position in this file:
 *
 *  - The renderer uses `screenInset: 'interactable'`, so the client's minimap,
 *    chat and left-side controls are already avoided.
 *  - The mobile client still draws its own action buttons over the bottom-RIGHT
 *    of that area, so the primary action sits bottom-CENTRE and nothing tappable
 *    is placed on the right edge.
 *  - Critical information is top-centre and centre, which is where the brief asks
 *    for it and where a thumb never covers it.
 */

import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { MIN_CIRCLE_PLAYERS, PAD_RADIUS } from '../../shared/config'
import { getEmotion } from '../../shared/emotions'
import { maxPossibleScore } from '../../shared/scoring'
import { CirclePhase } from '../../shared/types'
import { PAD_NAMES, cancelWaiting, requestFormCircle, waitingElsewhere } from '../circle'
import { MiniGameAction, MiniGamePanel, miniGameBrief, miniGameName } from '../miniGames'
import { roundFromPad, roundFromPractice } from '../miniGames/round'
import { startPractice, stopPractice } from '../practice'
import { getLayout } from '../mobile/safeArea'
import { state } from '../state'
import { COLORS, FONT, RADIUS, SPACE, TOUCH, emotionColor, emotionShade, toneColor } from './theme'
import {
  EmotionBadge,
  IconButton,
  Panel,
  PrimaryButton,
  ProgressBar,
  Row,
  Text
} from './widgets'

/* -------------------------------------------------------------------------- */
/* Top bar                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Identity strip: the player's emotion, today's featured emotion, and their
 * score. Deliberately the first thing on screen - a new player should be able to
 * answer "who am I in this game" without tapping anything.
 */
export function TopBar() {
  const layout = getLayout()
  const emotion = getEmotion(state.emotion)
  const featured = getEmotion(state.featuredEmotion)
  const isFeatured = state.emotion === state.featuredEmotion

  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: layout.compact ? 150 : 168,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: { top: SPACE.sm }
      }}
    >
      {/* Player identity */}
      <UiEntity
        uiTransform={{
          width: layout.compact ? 340 : 400,
          height: 124,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-start',
          padding: SPACE.sm,
          borderRadius: RADIUS.panel,
          borderWidth: 3,
          borderColor: emotionColor(state.emotion)
        }}
        uiBackground={{ color: emotionShade(state.emotion, 0.95) }}
      >
        <EmotionBadge emotion={state.emotion} size={84} />
        <UiEntity
          uiTransform={{
            width: layout.compact ? 220 : 280,
            height: 100,
            flexDirection: 'column',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: { left: SPACE.sm }
          }}
        >
          <Text
            value={`You are ${emotion.name}`}
            fontSize={FONT.body}
            color={COLORS.text}
            align="middle-left"
            height={Math.round(FONT.body * 1.3)}
          />
          <Text
            value={isFeatured ? 'Featured today - double points' : emotion.tagline}
            fontSize={FONT.small}
            color={isFeatured ? COLORS.good : COLORS.textDim}
            align="middle-left"
            height={Math.round(FONT.small * 1.4)}
          />
        </UiEntity>
      </UiEntity>

      {/* Featured emotion of the day */}
      {!layout.compact && (
        <UiEntity
          uiTransform={{
            width: 250,
            height: 124,
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: RADIUS.panel,
            margin: { left: SPACE.sm, right: SPACE.sm }
          }}
          uiBackground={{ color: COLORS.panel }}
        >
          <Text
            value="Featured today"
            fontSize={FONT.small}
            color={COLORS.textDim}
            height={Math.round(FONT.small * 1.3)}
          />
          <Text
            value={featured.name}
            fontSize={FONT.heading}
            color={emotionColor(state.featuredEmotion)}
            height={Math.round(FONT.heading * 1.25)}
          />
          <Text
            value="2x points"
            fontSize={FONT.small}
            color={COLORS.textDim}
            height={Math.round(FONT.small * 1.3)}
          />
        </UiEntity>
      )}

      {/* Score and rank */}
      <UiEntity
        uiTransform={{
          width: layout.compact ? 300 : 330,
          height: 124,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: RADIUS.panel,
          margin: { left: SPACE.sm }
        }}
        uiBackground={{ color: COLORS.panel }}
      >
        <MiniStat label="Score" value={String(state.score)} />
        <MiniStat
          label="Rank"
          value={state.rank > 0 ? `#${state.rank}` : '-'}
          color={state.rank === 1 ? COLORS.warn : COLORS.text}
        />
        <MiniStat
          label="Streak"
          value={`${state.streakDays}d`}
          color={state.streakDays > 1 ? COLORS.good : COLORS.text}
        />
      </UiEntity>
    </UiEntity>
  )
}

/** A single compact statistic inside the top bar. */
function MiniStat(props: { label: string; value: string; color?: typeof COLORS.text }) {
  return (
    <UiEntity
      uiTransform={{
        width: 100,
        height: 104,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <Text
        value={props.value}
        fontSize={FONT.heading}
        color={props.color ?? COLORS.text}
        height={Math.round(FONT.heading * 1.2)}
      />
      <Text
        value={props.label}
        fontSize={FONT.small}
        color={COLORS.textDim}
        height={Math.round(FONT.small * 1.2)}
      />
    </UiEntity>
  )
}

/* -------------------------------------------------------------------------- */
/* Centre: guidance / round / result                                          */
/* -------------------------------------------------------------------------- */

/** The middle of the screen. Shows whichever of four states applies. */
export function CenterStage() {
  const pad = state.myPad

  if (pad && pad.phase !== CirclePhase.Result) {
    return <ActiveRound />
  }

  if (pad && pad.phase === CirclePhase.Result) {
    return <RoundResult />
  }

  if (state.practice) {
    return <PracticeRound />
  }

  if (state.payout) {
    return <PayoutPanel />
  }

  return <PlazaGuidance />
}

/** A live, server-judged round. */
function ActiveRound() {
  const pad = state.myPad
  if (!pad) return <UiEntity uiTransform={{ width: 1, height: 1 }} />

  const round = roundFromPad(pad)
  const counting = pad.phase === CirclePhase.Countdown

  return (
    <Panel width={860} padding={SPACE.md}>
      <Row width="100%" justifyContent="center">
        <Text
          value={`${miniGameName(pad.game)} - ${pad.members.length} players`}
          fontSize={FONT.heading}
          color={COLORS.text}
          width={720}
        />
      </Row>

      {pad.comboBonus > 0 ? (
        <Text
          value={`${pad.comboName}: +${pad.comboBonus} bonus locked in`}
          fontSize={FONT.small}
          color={COLORS.good}
          width={720}
        />
      ) : (
        <Text
          value="No combo bonus this round - the circle still scores"
          fontSize={FONT.small}
          color={COLORS.textDim}
          width={720}
        />
      )}

      {counting ? (
        <Text
          value={miniGameBrief(pad.game)}
          fontSize={FONT.body}
          color={COLORS.textDim}
          width={780}
          marginTop={SPACE.xs}
        />
      ) : (
        <UiEntity uiTransform={{ width: 1, height: SPACE.xs }} />
      )}

      <MiniGamePanel round={round} />
    </Panel>
  )
}

/** The brief moment after a round, before the itemised payout arrives. */
function RoundResult() {
  const pad = state.myPad
  if (!pad) return <UiEntity uiTransform={{ width: 1, height: 1 }} />

  const mine = pad.myIndex >= 0 ? pad.points[pad.myIndex] ?? 0 : 0

  return (
    <Panel width={760} padding={SPACE.lg} borderWidth={4} borderColor={pad.success ? COLORS.good : COLORS.warn}>
      <Text
        value={pad.success ? 'Circle cleared' : 'Circle held'}
        fontSize={FONT.title}
        color={pad.success ? COLORS.good : COLORS.warn}
        width={640}
      />
      <Text
        value={pad.success ? miniGameName(pad.game) + ' complete' : 'Mini-game missed - base points still count'}
        fontSize={FONT.body}
        color={COLORS.textDim}
        width={680}
      />
      <Text
        value={`+${mine} points`}
        fontSize={FONT.hero}
        color={COLORS.text}
        width={520}
        marginTop={SPACE.sm}
      />
      <Row width="100%" justifyContent="center" marginTop={SPACE.sm}>
        {pad.members.map((address, index) => (
          <EmotionBadge
            key={address}
            emotion={pad.memberEmotions[index] ?? 0}
            size={66}
          />
        ))}
      </Row>
      <Text
        value="Stay on the pad to go again"
        fontSize={FONT.small}
        color={COLORS.textDim}
        width={520}
        marginTop={SPACE.sm}
      />
    </Panel>
  )
}

/** A solo practice run. Clearly labelled as unscored. */
function PracticeRound() {
  const practice = state.practice
  if (!practice) return <UiEntity uiTransform={{ width: 1, height: 1 }} />

  const round = roundFromPractice(practice, state.emotion)

  return (
    <Panel width={860} padding={SPACE.md} borderWidth={3} borderColor={COLORS.warn}>
      <Text
        value={`Practice - ${miniGameName(practice.game)}`}
        fontSize={FONT.heading}
        color={COLORS.warn}
        width={720}
      />
      <Text
        value="Practice scores nothing. Real circles need 2 or more players."
        fontSize={FONT.small}
        color={COLORS.textDim}
        width={780}
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
    <Panel width={720} padding={SPACE.lg} borderWidth={4} borderColor={COLORS.good}>
      <Text value="Points earned" fontSize={FONT.heading} color={COLORS.text} width={600} />
      <Text
        value={`+${payout.total}`}
        fontSize={FONT.hero}
        color={COLORS.good}
        width={480}
      />

      <PayoutLine label="Circle formed" value={`+${payout.base}`} />
      {payout.combo > 0 && <PayoutLine label="Emotion combo" value={`+${payout.combo}`} />}
      {payout.miniGame > 0 && (
        <PayoutLine label="Mini-game cleared" value={`+${payout.miniGame}`} />
      )}
      {payout.featuredMultiplier > 1 && (
        <PayoutLine label="Featured emotion" value={`x${payout.featuredMultiplier}`} />
      )}
      {streakPercent > 0 && (
        <PayoutLine label={`Streak bonus`} value={`+${streakPercent}%`} />
      )}

      <Text
        value={`Total ${payout.newScore}  -  rank #${payout.rank}`}
        fontSize={FONT.body}
        color={COLORS.textDim}
        width={620}
        marginTop={SPACE.sm}
      />

      {payout.unlockedSkin >= 0 && (
        <Text
          value={`Unlocked: ${getEmotion(payout.unlockedSkin).name} skin`}
          fontSize={FONT.body}
          color={COLORS.warn}
          width={620}
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
        width: 560,
        height: 52,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}
    >
      <Text
        value={props.label}
        fontSize={FONT.body}
        color={COLORS.textDim}
        align="middle-left"
        width={380}
      />
      <Text
        value={props.value}
        fontSize={FONT.body}
        color={COLORS.text}
        align="middle-right"
        width={160}
      />
    </UiEntity>
  )
}

/**
 * The default state: tells the player exactly what to do next.
 *
 * This card is the retention workhorse. It always answers "where do I go" and
 * "who is already there", because a social game dies if a newcomer cannot find
 * the other players.
 */
function PlazaGuidance() {
  const onPad = state.nearestPad >= 0
  const elsewhere = waitingElsewhere()
  const gathering = onPad ? state.pads[state.nearestPad] : undefined
  const waitingHere = gathering && gathering.phase === CirclePhase.Gathering
    ? gathering.members.length
    : 0

  let headline: string
  let detail: string

  if (state.waiting) {
    const needed = Math.max(0, MIN_CIRCLE_PLAYERS - waitingHere)
    headline = needed > 0 ? `Waiting for ${needed} more` : 'Circle forming'
    detail = 'Stay inside the ring. Anyone who steps in and taps joins you.'
  } else if (onPad) {
    headline = `You are on the ${PAD_NAMES[state.nearestPad]}`
    detail =
      waitingHere > 0
        ? `${waitingHere} player(s) already waiting here. Tap Form Circle to join.`
        : 'Tap Form Circle, then wait a moment for someone to join you.'
  } else if (elsewhere) {
    headline = `${elsewhere.count} waiting at the ${PAD_NAMES[elsewhere.padIndex]}`
    detail = 'Walk over and tap Form Circle to play with them.'
  } else {
    headline = 'Find a Mood Pad'
    detail = `Walk into one of the three glowing rings. Nearest is ${
      PAD_NAMES[nearestPadIndexForHint()]
    }, ${Math.max(0, Math.round(state.nearestPadDistance - PAD_RADIUS))}m away.`
  }

  return (
    <Panel width={820} padding={SPACE.lg}>
      <Text value={headline} fontSize={FONT.title} color={COLORS.text} width={740} />
      <Text
        value={detail}
        fontSize={FONT.body}
        color={COLORS.textDim}
        width={760}
        marginTop={SPACE.xs}
      />

      {state.waiting && waitingHere > 0 && (
        <UiEntity uiTransform={{ width: 520, height: 26, margin: { top: SPACE.md } }}>
          <ProgressBar
            value={Math.min(1, waitingHere / MIN_CIRCLE_PLAYERS)}
            fill={emotionColor(state.emotion)}
          />
        </UiEntity>
      )}

      <Row width="100%" justifyContent="center" marginTop={SPACE.md}>
        <Text
          value={`${state.playersOnline} here now  -  up to ${maxPossibleScore(
            state.streakDays
          )} points a circle`}
          fontSize={FONT.small}
          color={COLORS.textDim}
          width={700}
        />
      </Row>
    </Panel>
  )
}

/** Nearest pad even when the player is outside all of them, for the hint text. */
function nearestPadIndexForHint(): number {
  return state.nearestPad >= 0 ? state.nearestPad : 0
}

/* -------------------------------------------------------------------------- */
/* Bottom action row                                                          */
/* -------------------------------------------------------------------------- */

/** The bottom-centre controls. Never the bottom-right - see the file header. */
export function ActionRow() {
  const pad = state.myPad
  const layout = getLayout()

  // A live round replaces the whole row with the mini-game's own input.
  if (pad && pad.phase !== CirclePhase.Result) {
    return (
      <UiEntity
        uiTransform={{
          width: '100%',
          height: 210,
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: { bottom: layout.bottomGuard }
        }}
      >
        <MiniGameAction round={roundFromPad(pad)} />
      </UiEntity>
    )
  }

  if (state.practice) {
    const practice = state.practice
    return (
      <UiEntity
        uiTransform={{
          width: '100%',
          height: 260,
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: { bottom: layout.bottomGuard }
        }}
      >
        {!practice.finished && <MiniGameAction round={roundFromPractice(practice, state.emotion)} />}
        <Row width="100%" justifyContent="center" marginTop={SPACE.sm}>
          <IconButton label="Exit" onClick={() => stopPractice()} size={TOUCH.secondary} />
        </Row>
      </UiEntity>
    )
  }

  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: 260,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-end',
        padding: { bottom: layout.bottomGuard }
      }}
    >
      <PrimaryAction />
      <Row width="100%" justifyContent="center" marginTop={SPACE.sm}>
        <IconButton
          label="Board"
          onClick={() => {
            state.screen = 'leaderboard'
          }}
        />
        <IconButton
          label="Practice"
          onClick={() => startPractice()}
        />
        <IconButton
          label="Info"
          onClick={() => {
            state.screen = 'info'
          }}
        />
      </Row>
    </UiEntity>
  )
}

/** The single most important button in the game. */
function PrimaryAction() {
  const onPad = state.nearestPad >= 0

  if (state.waiting) {
    return (
      <PrimaryButton
        label="Waiting - tap to cancel"
        sublabel="Others can join you now"
        onClick={() => cancelWaiting()}
        background={COLORS.chip}
      />
    )
  }

  if (!onPad) {
    return (
      <PrimaryButton
        label="Walk to a Mood Pad"
        sublabel="Three glowing rings around the plaza"
        onClick={() => {
          // Not a no-op: surfacing the map hint is the useful action here.
          state.screen = 'info'
        }}
        background={COLORS.chip}
        labelColor={COLORS.textDim}
      />
    )
  }

  return (
    <PrimaryButton
      label="Form Circle"
      sublabel={`On the ${PAD_NAMES[state.nearestPad]}`}
      onClick={() => requestFormCircle()}
      background={emotionColor(state.emotion)}
      labelColor={COLORS.panel}
    />
  )
}

/* -------------------------------------------------------------------------- */
/* Overlays                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A transient toast, positioned just under the top bar.
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
        height: 90,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <UiEntity
        uiTransform={{
          width: 820,
          height: 76,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: RADIUS.pill,
          borderWidth: 3,
          borderColor: toneColor(notice.tone)
        }}
        uiBackground={{ color: COLORS.panel }}
      >
        <Text
          value={notice.text}
          fontSize={FONT.body}
          color={COLORS.text}
          height={Math.round(FONT.body * 1.4)}
        />
      </UiEntity>
    </UiEntity>
  )
}

/**
 * Connection state banner.
 *
 * Two genuinely different failures, shown differently on purpose. The room not
 * being synced is transient (about a second on load). The server not being alive
 * can mean a 15-second cold start, or a server that has not been woken at all -
 * so that case gets an explicit, honest message instead of a silent wait.
 */
export function ConnectionBanner() {
  if (state.serverAlive && state.roomReady) {
    return <UiEntity uiTransform={{ width: 1, height: 1 }} />
  }

  const message = !state.roomReady
    ? 'Connecting to the plaza...'
    : 'Waking the Mood Match server - this can take about 15 seconds on a quiet day.'

  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: 84,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <UiEntity
        uiTransform={{
          width: 900,
          height: 72,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: RADIUS.pill,
          borderWidth: 3,
          borderColor: COLORS.warn
        }}
        uiBackground={{ color: COLORS.panel }}
      >
        <Text
          value={message}
          fontSize={FONT.small}
          color={COLORS.warn}
          height={Math.round(FONT.small * 1.4)}
        />
      </UiEntity>
    </UiEntity>
  )
}
