/**
 * Mood Match - reusable UI primitives.
 *
 * Conventions applied everywhere in this file, both driven by verified engine
 * behaviour rather than taste:
 *
 *  - Every text node declares an explicit width AND height. Bevy measures text
 *    and lays it out; the Unity explorer treats an unset dimension as ~0 while
 *    still drawing the glyphs, which makes stacked labels overlap and their
 *    parent collapse. Explicit boxes render identically on both.
 *  - Pointer handlers go on the smallest element that needs them, never on a
 *    layout wrapper. A handler makes an element capture pointer input across its
 *    whole rect, so a handler on a 100%x100% wrapper would make the entire scene
 *    untappable while still looking correct.
 *  - Text is ASCII only. The Unity explorer has no emoji glyphs.
 */

import ReactEcs, { Key, Label, PositionUnit, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { getEmotion } from '../../shared/emotions'
import { EmotionId } from '../../shared/types'
import { COLORS, FONT, RADIUS, SPACE, TOUCH, emotionColor, emotionShade, textOn } from './theme'

/* -------------------------------------------------------------------------- */
/* Text                                                                       */
/* -------------------------------------------------------------------------- */

export interface TextProps {
  value: string
  fontSize?: number
  color?: Color4
  width?: PositionUnit | 'auto'
  height?: PositionUnit | 'auto'
  align?:
    | 'top-left'
    | 'top-center'
    | 'top-right'
    | 'middle-left'
    | 'middle-center'
    | 'middle-right'
    | 'bottom-left'
    | 'bottom-center'
    | 'bottom-right'
  marginTop?: number
  marginBottom?: number
}

/**
 * A text node with a guaranteed layout box.
 *
 * `height` defaults to a comfortable line box derived from the font size, so
 * callers cannot accidentally omit it.
 */
export function Text(props: TextProps) {
  const fontSize = props.fontSize ?? FONT.body
  const height = props.height ?? Math.round(fontSize * 1.45)
  return (
    <Label
      value={props.value}
      fontSize={fontSize}
      color={props.color ?? COLORS.text}
      font="sans-serif"
      textAlign={props.align ?? 'middle-center'}
      uiTransform={{
        width: props.width ?? '100%',
        height,
        margin: {
          top: props.marginTop ?? 0,
          bottom: props.marginBottom ?? 0
        }
      }}
    />
  )
}

/**
 * Multi-line text. `lines` must be the expected wrapped line count so the box
 * can be sized correctly - an under-sized box clips on Unity.
 */
export function Paragraph(props: {
  value: string
  lines: number
  fontSize?: number
  color?: Color4
  marginBottom?: number
}) {
  const fontSize = props.fontSize ?? FONT.body
  return (
    <Label
      value={props.value}
      fontSize={fontSize}
      color={props.color ?? COLORS.textDim}
      font="sans-serif"
      textAlign="middle-center"
      textWrap="wrap"
      uiTransform={{
        width: '100%',
        height: Math.round(fontSize * 1.45 * props.lines),
        margin: { bottom: props.marginBottom ?? 0 }
      }}
    />
  )
}

/* -------------------------------------------------------------------------- */
/* Containers                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A rounded panel.
 *
 * Carries `pointerFilter: 'block'` so taps inside a panel do not fall through to
 * the 3D world behind it. That is safe because a panel is never full-screen -
 * see the scrim note in `Modal`.
 */
export function Panel(props: {
  children?: ReactEcs.JSX.Element | ReactEcs.JSX.Element[] | (ReactEcs.JSX.Element | false)[]
  width?: PositionUnit | 'auto'
  height?: PositionUnit | 'auto'
  padding?: number
  background?: Color4
  borderColor?: Color4
  borderWidth?: number
  alignItems?: 'flex-start' | 'center' | 'flex-end'
  justifyContent?: 'flex-start' | 'center' | 'flex-end' | 'space-between'
  flexDirection?: 'row' | 'column'
  marginTop?: number
}) {
  return (
    <UiEntity
      uiTransform={{
        width: props.width ?? 'auto',
        height: props.height ?? 'auto',
        flexDirection: props.flexDirection ?? 'column',
        alignItems: props.alignItems ?? 'center',
        justifyContent: props.justifyContent ?? 'center',
        padding: props.padding ?? SPACE.lg,
        borderRadius: RADIUS.panel,
        borderWidth: props.borderWidth ?? 0,
        borderColor: props.borderColor ?? COLORS.none,
        margin: { top: props.marginTop ?? 0 },
        pointerFilter: 'block'
      }}
      uiBackground={{ color: props.background ?? COLORS.panel }}
    >
      {props.children}
    </UiEntity>
  )
}

/**
 * A full-screen modal container.
 *
 * The scrim DOES block pointers across the whole screen - that is the one
 * legitimate case for a full-screen blocker, because a modal is supposed to
 * swallow stray taps while open. It is only ever rendered while a modal is
 * actually up, never as a persistent layout wrapper.
 */
export function Modal(props: {
  children?: ReactEcs.JSX.Element | ReactEcs.JSX.Element[] | (ReactEcs.JSX.Element | false)[]
}) {
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        positionType: 'absolute',
        position: { top: 0, left: 0 },
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        pointerFilter: 'block'
      }}
      uiBackground={{ color: COLORS.scrim }}
    >
      {props.children}
    </UiEntity>
  )
}

/** A horizontal row. Purely layout - deliberately carries no pointer handler. */
export function Row(props: {
  children?: ReactEcs.JSX.Element | ReactEcs.JSX.Element[] | (ReactEcs.JSX.Element | false)[]
  gap?: number
  justifyContent?: 'flex-start' | 'center' | 'flex-end' | 'space-between'
  alignItems?: 'flex-start' | 'center' | 'flex-end'
  width?: PositionUnit | 'auto'
  height?: PositionUnit | 'auto'
  marginTop?: number
}) {
  return (
    <UiEntity
      uiTransform={{
        width: props.width ?? 'auto',
        height: props.height ?? 'auto',
        flexDirection: 'row',
        alignItems: props.alignItems ?? 'center',
        justifyContent: props.justifyContent ?? 'center',
        margin: { top: props.marginTop ?? 0 }
      }}
    >
      {props.children}
    </UiEntity>
  )
}

/** Fixed-size transparent spacer. */
export function Spacer(props: { size: number; horizontal?: boolean }) {
  return (
    <UiEntity
      uiTransform={{
        width: props.horizontal ? props.size : 1,
        height: props.horizontal ? 1 : props.size
      }}
    />
  )
}

/* -------------------------------------------------------------------------- */
/* Buttons                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The primary action button: a wide bottom-centre bar.
 *
 * Deliberately NOT in the bottom-right corner - the mobile client draws its own
 * action buttons over that area even inside the interactable inset, so anything
 * we put there competes for the same taps.
 */
export function PrimaryButton(props: {
  label: string
  sublabel?: string
  onClick: () => void
  background?: Color4
  labelColor?: Color4
  disabled?: boolean
  width?: number
  height?: number
}) {
  const background = props.disabled
    ? COLORS.chip
    : props.background ?? COLORS.accent
  const labelColor = props.disabled ? COLORS.textDim : props.labelColor ?? COLORS.text
  const height = props.height ?? TOUCH.primaryHeight

  return (
    <UiEntity
      uiTransform={{
        width: props.width ?? TOUCH.primaryWidth,
        height,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: RADIUS.pill,
        pointerFilter: 'block'
      }}
      uiBackground={{ color: background }}
      onMouseDown={() => {
        if (!props.disabled) props.onClick()
      }}
    >
      <Text
        value={props.label}
        fontSize={FONT.heading}
        color={labelColor}
        height={Math.round(FONT.heading * 1.3)}
      />
      {props.sublabel ? (
        <Text
          value={props.sublabel}
          fontSize={FONT.small}
          color={labelColor}
          height={Math.round(FONT.small * 1.3)}
        />
      ) : (
        false
      )}
    </UiEntity>
  )
}

/** A compact square button for secondary actions. */
export function IconButton(props: {
  label: string
  onClick: () => void
  size?: number
  background?: Color4
  labelColor?: Color4
  active?: boolean
}) {
  const size = props.size ?? TOUCH.secondary
  return (
    <UiEntity
      uiTransform={{
        width: size,
        height: size,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: RADIUS.chip,
        borderWidth: props.active ? 3 : 0,
        borderColor: props.active ? COLORS.accent : COLORS.none,
        margin: { left: SPACE.xs, right: SPACE.xs },
        pointerFilter: 'block'
      }}
      uiBackground={{ color: props.background ?? COLORS.chip }}
      onMouseDown={props.onClick}
    >
      <Text
        value={props.label}
        fontSize={FONT.small}
        color={props.labelColor ?? COLORS.text}
        height={Math.round(FONT.small * 1.3)}
      />
    </UiEntity>
  )
}

/* -------------------------------------------------------------------------- */
/* Emotion display                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A circular emotion badge.
 *
 * Identity comes from the fill colour plus a plain-ASCII glyph - no texture file
 * and no emoji, so it renders identically on every explorer and costs nothing to
 * load on a phone.
 */
export function EmotionBadge(props: {
  /** Identity when rendered inside an array. */
  key?: Key
  emotion: EmotionId | number
  size?: number
  showName?: boolean
  dimmed?: boolean
}) {
  const size = props.size ?? 96
  const emotion = getEmotion(props.emotion)
  const alpha = props.dimmed ? 0.35 : 1

  return (
    <UiEntity
      uiTransform={{
        width: size,
        height: props.showName ? size + Math.round(FONT.small * 1.5) : size,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <UiEntity
        uiTransform={{
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: RADIUS.pill,
          borderWidth: Math.max(3, Math.round(size * 0.06)),
          borderColor: emotionColor(props.emotion, alpha)
        }}
        uiBackground={{ color: emotionShade(props.emotion, alpha) }}
      >
        <Text
          value={emotion.glyph}
          fontSize={Math.round(size * 0.42)}
          color={emotionColor(props.emotion, alpha)}
          height={Math.round(size * 0.6)}
        />
      </UiEntity>
      {props.showName ? (
        <Text
          value={emotion.name}
          fontSize={FONT.small}
          color={emotionColor(props.emotion, alpha)}
          height={Math.round(FONT.small * 1.4)}
        />
      ) : (
        false
      )}
    </UiEntity>
  )
}

/** A solid colour swatch used as a Color Match tap target. */
export function ColorTarget(props: {
  /** Identity when rendered inside an array. */
  key?: Key
  emotion: EmotionId | number
  size?: number
  onClick?: () => void
  highlighted?: boolean
}) {
  const size = props.size ?? TOUCH.gameButton
  const emotion = getEmotion(props.emotion)

  return (
    <UiEntity
      uiTransform={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: RADIUS.chip,
        borderWidth: props.highlighted ? 6 : 0,
        borderColor: props.highlighted ? COLORS.text : COLORS.none,
        margin: { left: SPACE.sm, right: SPACE.sm },
        pointerFilter: props.onClick ? 'block' : 'none'
      }}
      uiBackground={{ color: emotionColor(props.emotion) }}
      onMouseDown={props.onClick}
    >
      <Text
        value={emotion.glyph}
        fontSize={Math.round(size * 0.34)}
        color={textOn(props.emotion)}
        height={Math.round(size * 0.5)}
      />
    </UiEntity>
  )
}

/* -------------------------------------------------------------------------- */
/* Progress                                                                   */
/* -------------------------------------------------------------------------- */

/** A horizontal progress bar. `value` is clamped to 0..1. */
export function ProgressBar(props: {
  value: number
  width?: PositionUnit | 'auto'
  height?: number
  fill?: Color4
  track?: Color4
}) {
  const clamped = Math.max(0, Math.min(1, props.value))
  const height = props.height ?? 26

  return (
    <UiEntity
      uiTransform={{
        width: props.width ?? '100%',
        height,
        borderRadius: RADIUS.pill,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start'
      }}
      uiBackground={{ color: props.track ?? COLORS.chip }}
    >
      <UiEntity
        uiTransform={{
          // Percentage width is how a fill bar is driven in React-ECS.
          width: `${Math.round(clamped * 100)}%`,
          height,
          borderRadius: RADIUS.pill
        }}
        uiBackground={{ color: props.fill ?? COLORS.accent }}
      />
    </UiEntity>
  )
}

/** A labelled statistic chip. */
export function StatChip(props: {
  label: string
  value: string
  color?: Color4
  width?: number
}) {
  return (
    <UiEntity
      uiTransform={{
        width: props.width ?? 190,
        height: 104,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: RADIUS.chip,
        margin: { left: SPACE.xs, right: SPACE.xs }
      }}
      uiBackground={{ color: COLORS.chip }}
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
