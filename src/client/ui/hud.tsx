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
import { getPerk } from '../../shared/moodPerks'
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
import {
  ALL_MINI_GAMES,
  MiniGameAction,
  MiniGamePanel,
  gameIcon,
  isCompetitive,
  miniGameName
} from '../miniGames'
import { ordinal } from '../miniGames/standings'
import { leaders, raceCount, roundFromPad, roundFromPractice } from '../miniGames/round'
import { practiceBest, startPractice, stopPractice } from '../practice'
import { ComboPreview, StartingCard } from './startingCard'
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
        {/*
          The PERK, not the word "mood". This is the line that tells a player their
          mood does something - the previous version said nothing at all.
        */}
        <Text
          value={isFeatured ? `${getPerk(state.emotion).name}  x2` : getPerk(state.emotion).name}
          fontSize={FONT.tiny}
          color={isFeatured ? COLORS.good : emotionColor(state.emotion)}
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

  // A locked-in circle gets the loud countdown card before the game itself.
  if (pad && pad.phase === CirclePhase.Countdown) return <StartingCard />
  if (pad && pad.phase === CirclePhase.Playing) return <ActiveRound />
  if (pad && pad.phase === CirclePhase.Result) return <RoundResult />
  if (state.practice) return <PracticeRound />
  if (state.payout) return <PayoutPanel />
  if (state.screen === 'practicePick') return <PracticePicker />

  // Standing on a filling pad: show what the group's moods would score. This is
  // where moods stop being an invisible stat.
  return <ComboPreview />
}

/** Width of one card in the practice picker, including its margins. */
const PICK_CARD_WIDTH = 150

/**
 * Lets the player pick which mini-game to practise.
 *
 * A random game was frustrating for practice specifically: the whole reason to open
 * it is to rehearse the one you keep losing.
 *
 * Each card leads with the game's icon. The names are the weakest part of this screen -
 * "Sync Tap" and "Tap Race" are one word apart and mean nothing until you have played
 * both - so the glyph does the identifying and the text confirms it.
 *
 * WIDTHS: six cards at `PICK_CARD_WIDTH` plus 2x`SPACE.xs` margins is
 * 6 x 158 = 948, inside the 972 of usable width a 1000-wide panel leaves after padding.
 * The panel was 720 while the cards were 158 wide, so the last two spilled off the
 * right-hand edge and two of the six games were simply unreachable. Any change to the
 * card width or the game count has to be checked against this sum; `check-logic`
 * asserts it.
 */
function PracticePicker() {
  return (
    <Panel width={1000} maxHeight={BUDGET.centreMax} padding={SPACE.md} textured>
      <Text value="Practise which game?" fontSize={FONT.heading} color={COLORS.text} width={900} />
      <Text
        value="Unscored - real circles need other players"
        fontSize={FONT.tiny}
        color={COLORS.textDim}
        width={900}
      />
      <Row width="100%" justifyContent="center" marginTop={SPACE.sm}>
        {ALL_MINI_GAMES.map((game) => (
          <UiEntity
            key={`pick-game-${game}`}
            uiTransform={{
              width: PICK_CARD_WIDTH,
              height: 104,
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: RADIUS.chip,
              margin: { left: SPACE.xs, right: SPACE.xs },
              pointerFilter: 'block'
            }}
            uiBackground={{ color: COLORS.chip }}
            onMouseDown={() => {
              state.screen = 'hud'
              startPractice(game)
            }}
          >
            <Icon src={gameIcon(game)} size={40} color={COLORS.text} />
            <Text value={miniGameName(game)} fontSize={FONT.tiny} color={COLORS.text} />
            <Text
              value={`best ${Math.round(practiceBest(game) * 100)}%`}
              fontSize={FONT.tiny}
              color={COLORS.textDim}
            />
          </UiEntity>
        ))}
      </Row>
      <Row width="100%" justifyContent="center" marginTop={SPACE.sm}>
        <IconButton
          icon={ICON.close}
          caption="Cancel"
          onClick={() => {
            state.screen = 'hud'
          }}
        />
      </Row>
    </Panel>
  )
}

/** A live, server-judged round. */
function ActiveRound() {
  const pad = state.myPad
  if (!pad) return <UiEntity uiTransform={{ width: 1, height: 1 }} />

  const round = roundFromPad(pad)

  return (
    <Panel width={780} maxHeight={BUDGET.centreMax} padding={SPACE.md} textured>
      {/*
        The game's glyph sits next to its name so a player glancing back at the screen
        mid-round can re-orient without reading. Under time pressure the icon lands
        noticeably faster than the words do.
      */}
      <Row width="100%" justifyContent="center">
        <Icon src={gameIcon(pad.game)} size={34} color={COLORS.text} />
        <Text
          value={`${miniGameName(pad.game)}  -  ${PAD_NAMES[pad.padIndex]}  ${pad.members.length}/${pad.required}`}
          fontSize={FONT.heading}
          color={COLORS.text}
          width={580}
        />
      </Row>

      <Text
        value={
          pad.comboBonus > 0
            ? `${pad.comboName} +${pad.comboBonus}  -  your perk: ${getPerk(state.emotion).name}`
            : `Your perk: ${getPerk(state.emotion).name} - ${getPerk(state.emotion).blurb}`
        }
        fontSize={FONT.tiny}
        color={pad.comboBonus > 0 ? COLORS.good : COLORS.textDim}
        width={720}
      />

      <MiniGamePanel round={round} />
    </Panel>
  )
}

/** The moment after a round, before the itemised payout arrives. */
function RoundResult() {
  const pad = state.myPad
  if (!pad) return <UiEntity uiTransform={{ width: 1, height: 1 }} />

  const mine = pad.myIndex >= 0 ? pad.points[pad.myIndex] ?? 0 : 0

  // Who won, taken from the SERVER's ranking rather than worked out here.
  //
  // This line and the payout panel that follows it have to name the same player, and
  // for a while they did not. Deriving the winner from the highest number went wrong in
  // Tap Race twice over: the ranking puts whoever crossed the target first above
  // everyone regardless of count, and when nobody reaches it the ranking falls back to
  // the perk-weighted score while the bars on screen show raw taps. A player could be
  // announced as the winner here and then read "Finished 2nd" a moment later.
  const resultRound = roundFromPad(pad)
  const winners = leaders(resultRound)
  const iWon = winners.indexOf(pad.myIndex) !== -1
  const ranked = isCompetitive(pad.game) && pad.members.length > 1 && winners.length > 0

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
      {/* Who won. This is the payoff of making rounds competitive - somebody has
          to be named, or the race had no point. */}
      {ranked && (
        <Text
          value={
            iWon
              ? winners.length > 1
                ? 'Joint winner'
                : 'You won the round'
              : `${trimWinner(pad.memberNames[winners[0] ?? 0] ?? 'Someone')} won it`
          }
          fontSize={FONT.heading}
          color={iWon ? COLORS.good : COLORS.textDim}
          width={520}
        />
      )}

      <Text
        value={`+${mine} points`}
        fontSize={FONT.hero}
        color={COLORS.text}
        width={420}
      />

      {/* Final standings, so everyone can see the order. */}
      <Row width="100%" justifyContent="center" marginTop={SPACE.xs}>
        {pad.members.map((address, index) => (
          <UiEntity
            key={address}
            uiTransform={{
              width: 82,
              height: 68,
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <EmotionBadge emotion={pad.memberEmotions[index] ?? 0} size={38} />
            <Text
              value={ranked ? String(raceCount(resultRound, index)) : ''}
              fontSize={FONT.tiny}
              color={
                ranked && winners.indexOf(index) !== -1 ? COLORS.good : COLORS.textDim
              }
            />
          </UiEntity>
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
      {/* Compressed: the breakdown can run to seven rows now that placement has its
          own line, and at the previous sizes the total and the skin-unlock line were
          clipped off the bottom of the panel. */}
      <Text value="Points earned" fontSize={FONT.small} color={COLORS.textDim} width={460} />
      <Text value={`+${payout.total}`} fontSize={FONT.title} color={COLORS.good} width={400} />

      <PayoutLine label="Circle formed" value={`+${payout.base}`} />
      {payout.combo > 0 && <PayoutLine label="Emotion combo" value={`+${payout.combo}`} />}
      {payout.miniGame > 0 && (
        <PayoutLine label="Mini-game cleared" value={`+${payout.miniGame}`} />
      )}
      {payout.groupSize > 0 && (
        <PayoutLine label="Bigger circle" value={`+${payout.groupSize}`} />
      )}
      {payout.placement > 0 && (
        <PayoutLine
          // "Joint" matters: tied players split their combined slices, so a two-way tie
          // for first pays well under an outright win. Without the word, the line reads
          // "Finished 1st of 2  +17" and looks like the prize was miscalculated.
          label={
            payout.tiedAtRank > 1
              ? `Joint ${ordinal(payout.finishRank)} of ${payout.memberCount} - split`
              : `Finished ${ordinal(payout.finishRank)} of ${payout.memberCount}`
          }
          value={`+${payout.placement}`}
        />
      )}
      {payout.featuredMultiplier > 1 && (
        <PayoutLine label="Featured mood" value={`x${payout.featuredMultiplier}`} />
      )}
      {streakPercent > 0 && <PayoutLine label="Streak bonus" value={`+${streakPercent}%`} />}

      <Text
        value={`Total ${payout.newScore}  -  rank #${payout.rank}`}
        fontSize={FONT.tiny}
        color={COLORS.textDim}
        width={460}
        marginTop={SPACE.xs}
      />

      {payout.unlockedSkin >= 0 && (
        <Text
          value={`Unlocked: ${getEmotion(payout.unlockedSkin).name} skin`}
          fontSize={FONT.tiny}
          color={COLORS.warn}
          width={460}
        />
      )}
    </Panel>
  )
}

/**
 * Abbreviates a compass name so it fits a directory chip.
 * "SouthEast" is 9 characters and collided with its neighbour at five pads.
 */
function compass(where: string): string {
  if (where === 'SouthEast') return 'SE'
  if (where === 'SouthWest') return 'SW'
  if (where === 'NorthEast') return 'NE'
  if (where === 'NorthWest') return 'NW'
  return where.slice(0, 1)
}

/** Keeps a winner's name short in the result headline. */
function trimWinner(name: string): string {
  if (!name) return 'Someone'
  if (name.length <= 12) return name
  return name.slice(0, 11) + '.'
}

/** One row of the payout breakdown. */
function PayoutLine(props: { label: string; value: string }) {
  return (
    <UiEntity
      uiTransform={{
        width: 440,
        height: textHeight(FONT.tiny) + 2,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}
    >
      <Text
        value={props.label}
        fontSize={FONT.tiny}
        color={COLORS.textDim}
        align="middle-left"
        width={300}
      />
      <Text
        value={props.value}
        fontSize={FONT.tiny}
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
          onClick={() => {
            state.screen = state.screen === 'practicePick' ? 'hud' : 'practicePick'
          }}
          active={state.screen === 'practicePick'}
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
      {/*
        Sized to FIT. With five pads the previous 150px chips needed 770px inside a
        470px row, so the captions collided and rendered as "Duo - SouthDuo - South".
        88px each plus margins is 460 of 470, and the compass name is abbreviated so
        the label fits its chip.
      */}
      {PAD_NAMES.map((name, index) => {
        const fill = padFillFor(index)
        const active = fill.here > 0
        return (
          <UiEntity
            key={`dir-${index}`}
            uiTransform={{
              width: 88,
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
              value={`${name.replace(' Pad', '')} ${compass(PAD_WHERE[index])}`}
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
