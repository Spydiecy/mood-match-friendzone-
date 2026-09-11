/**
 * Mood Match - reusable UI primitives.
 *
 * Conventions here are driven by verified engine behaviour, not taste:
 *
 *  - Every text node declares an explicit width AND height, and the height is
 *    sized for the number of lines the text will actually wrap to. Bevy measures
 *    intrinsic text size; the Unity explorer gives an unset dimension ~0 while
 *    still drawing the glyphs, so unsized labels overlap and their parents
 *    collapse. An UNDER-sized box clips, which is how "Featured today - double
 *    points" and "Curiosity" ended up cut off on a phone.
 *  - Pointer handlers go on the smallest element that needs them, never on a
 *    layout wrapper. A handler makes an element capture pointer input across its
 *    whole rect, so a handler on a 100%x100% wrapper would make the entire scene
 *    untappable while still looking correct.
 *  - Text is ASCII only. Pictorial affordances come from `images/icons/*.png`,
 *    because the Unity explorer has no emoji glyphs.
 *  - Modals must FIT the 720-high canvas and always expose a close control, or
 *    the player gets trapped in a panel whose button is off-screen.
 */

import ReactEcs, { Key, Label, PositionUnit, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { getEmotion } from '../../shared/emotions'
import { EmotionId } from '../../shared/types'
import {
  CANVAS,
  COLORS,
  FONT,
  ICON,
  PANEL_TEXTURE,
  RADIUS,
  SPACE,
  TOUCH,
  emotionColor,
  emotionShade,
  textHeight,
  textOn
} from './theme'

/* -------------------------------------------------------------------------- */
/* Text                                                                       */
/* -------------------------------------------------------------------------- */

export interface TextProps {
  key?: Key
  value: string
  fontSize?: number
  color?: Color4
  width?: PositionUnit | 'auto'
  /**
   * Number of lines the text occupies. Height is derived from this, so a value
   * that is too low CLIPS on the Unity explorer. When in doubt, round up.
   */
  lines?: number
  /** Explicit override; prefer `lines`. */
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
  wrap?: boolean
  marginTop?: number
  marginBottom?: number
}

/** A text node with a guaranteed, correctly-sized layout box. */
export function Text(props: TextProps) {
  const fontSize = props.fontSize ?? FONT.body
  const lines = props.lines ?? 1
  return (
    <Label
      value={props.value}
      fontSize={fontSize}
      color={props.color ?? COLORS.text}
      font="sans-serif"
      textAlign={props.align ?? 'middle-center'}
      textWrap={props.wrap ? 'wrap' : 'nowrap'}
      uiTransform={{
        width: props.width ?? '100%',
        height: props.height ?? textHeight(fontSize, lines),
        margin: {
          top: props.marginTop ?? 0,
          bottom: props.marginBottom ?? 0
        }
      }}
    />
  )
}

/** Wrapped body text. `lines` must cover the wrapped line count. */
export function Paragraph(props: {
  value: string
  lines: number
  fontSize?: number
  color?: Color4
  width?: PositionUnit | 'auto'
  marginBottom?: number
}) {
  return (
    <Text
      value={props.value}
      fontSize={props.fontSize ?? FONT.small}
      color={props.color ?? COLORS.textDim}
      width={props.width ?? '100%'}
      lines={props.lines}
      wrap
      marginBottom={props.marginBottom ?? 0}
    />
  )
}

/* -------------------------------------------------------------------------- */
/* Icons                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A generated PNG icon.
 *
 * The source images are white on transparency, so `color` tints them. This is the
 * supported way to get a pictorial affordance into Decentraland UI - emoji are not,
 * because the Unity explorer ships no emoji glyphs and renders them as blank boxes.
 */
export function Icon(props: {
  src: string
  size?: number
  color?: Color4
  marginTop?: number
  marginBottom?: number
}) {
  const size = props.size ?? TOUCH.icon
  return (
    <UiEntity
      uiTransform={{
        width: size,
        height: size,
        margin: { top: props.marginTop ?? 0, bottom: props.marginBottom ?? 0 }
      }}
      uiBackground={{
        texture: { src: props.src },
        textureMode: 'stretch',
        color: props.color ?? COLORS.text
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
 * `pointerFilter: 'block'` so taps inside a panel do not fall through to the 3D
 * world. Safe because a panel is never full-screen - see the note on `Modal`.
 */
export function Panel(props: {
  children?: ReactEcs.JSX.Element | ReactEcs.JSX.Element[] | (ReactEcs.JSX.Element | false)[]
  width?: PositionUnit | 'auto'
  height?: PositionUnit | 'auto'
  maxHeight?: PositionUnit
  padding?: number
  background?: Color4
  borderColor?: Color4
  borderWidth?: number
  /** Draws the generated grid texture behind the content, for depth. */
  textured?: boolean
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
        maxHeight: props.maxHeight,
        flexDirection: props.flexDirection ?? 'column',
        alignItems: props.alignItems ?? 'center',
        justifyContent: props.justifyContent ?? 'center',
        padding: props.padding ?? SPACE.md,
        borderRadius: RADIUS.panel,
        borderWidth: props.borderWidth ?? 0,
        borderColor: props.borderColor ?? COLORS.none,
        margin: { top: props.marginTop ?? 0 },
        pointerFilter: 'block'
      }}
      uiBackground={
        props.textured
          ? {
              texture: { src: PANEL_TEXTURE },
              textureMode: 'stretch',
              color: props.background ?? COLORS.panel
            }
          : { color: props.background ?? COLORS.panel }
      }
    >
      {props.children}
    </UiEntity>
  )
}

/**
 * A full-screen modal with a guaranteed-visible close button.
 *
 * The scrim DOES block pointers across the whole screen - the one legitimate case
 * for a full-screen blocker, because a modal should swallow stray taps while open.
 * It is only ever rendered while a modal is actually up.
 *
 * The close X is positioned relative to the panel and rendered LAST, and the panel
 * is capped to the canvas height. Previously the panel could grow taller than the
 * screen, putting its only close button below the bottom edge and trapping the
 * player in a menu they could not dismiss.
 */
export function Modal(props: {
  children?: ReactEcs.JSX.Element | ReactEcs.JSX.Element[] | (ReactEcs.JSX.Element | false)[]
  onClose: () => void
  width?: number
  title?: string
}) {
  const width = props.width ?? 940

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
      <UiEntity
        uiTransform={{
          width,
          // Hard cap: never taller than the canvas minus a margin, so the close
          // button and everything above it always stay on screen.
          maxHeight: CANVAS.height - SPACE.xl,
          height: 'auto',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          padding: SPACE.lg,
          borderRadius: RADIUS.panel,
          pointerFilter: 'block'
        }}
        uiBackground={{ color: COLORS.panel }}
      >
        {/* Header row: title plus an always-present close control. */}
        <UiEntity
          uiTransform={{
            width: '100%',
            height: TOUCH.close,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <Text
            value={props.title ?? ''}
            fontSize={FONT.title}
            color={COLORS.text}
            align="middle-left"
            width={width - TOUCH.close - SPACE.lg * 2}
          />
          <UiEntity
            uiTransform={{
              width: TOUCH.close,
              height: TOUCH.close,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: RADIUS.chip,
              pointerFilter: 'block'
            }}
            uiBackground={{ color: COLORS.chip }}
            onMouseDown={props.onClose}
          >
            <Icon src={ICON.close} size={30} />
          </UiEntity>
        </UiEntity>

        {props.children}
      </UiEntity>
    </UiEntity>
  )
}

/** A horizontal row. Purely layout - deliberately carries no pointer handler. */
export function Row(props: {
  children?: ReactEcs.JSX.Element | ReactEcs.JSX.Element[] | (ReactEcs.JSX.Element | false)[]
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
 * The primary action: a wide bottom-centre bar.
 *
 * Deliberately NOT in the bottom-right corner - the mobile client draws its own
 * action buttons over that area even inside the interactable inset, so anything
 * placed there competes for the same taps.
 */
export function PrimaryButton(props: {
  label: string
  sublabel?: string
  icon?: string
  onClick: () => void
  background?: Color4
  labelColor?: Color4
  disabled?: boolean
  width?: number
}) {
  const background = props.disabled ? COLORS.chip : props.background ?? COLORS.accent
  const labelColor = props.disabled ? COLORS.textDim : props.labelColor ?? COLORS.text

  return (
    <UiEntity
      uiTransform={{
        width: props.width ?? TOUCH.primaryWidth,
        height: TOUCH.primaryHeight,
        flexDirection: 'row',
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
      {props.icon ? (
        <Icon src={props.icon} size={30} color={labelColor} />
      ) : (
        false
      )}
      <UiEntity
        uiTransform={{
          width: (props.width ?? TOUCH.primaryWidth) - (props.icon ? 60 : 20),
          height: 'auto',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Text value={props.label} fontSize={FONT.heading} color={labelColor} />
        {props.sublabel ? (
          <Text value={props.sublabel} fontSize={FONT.tiny} color={labelColor} />
        ) : (
          false
        )}
      </UiEntity>
    </UiEntity>
  )
}

/**
 * A square icon button with a small caption.
 *
 * Icon plus caption rather than icon alone: an unlabelled icon is guesswork, and
 * the caption is what makes the control usable the first time and accessible to
 * anyone who does not recognise the glyph.
 */
export function IconButton(props: {
  key?: Key
  icon: string
  caption?: string
  onClick: () => void
  size?: number
  background?: Color4
  tint?: Color4
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
      <Icon
        src={props.icon}
        size={props.caption ? Math.round(size * 0.42) : Math.round(size * 0.55)}
        color={props.tint ?? COLORS.text}
      />
      {props.caption ? (
        <Text
          value={props.caption}
          fontSize={FONT.tiny}
          color={props.tint ?? COLORS.textDim}
          marginTop={2}
        />
      ) : (
        false
      )}
    </UiEntity>
  )
}

/* -------------------------------------------------------------------------- */
/* Emotion display                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A circular emotion badge.
 *
 * Identity comes from the fill colour plus a plain-ASCII glyph - no emoji, so it
 * renders identically on every explorer and costs nothing to load.
 */
export function EmotionBadge(props: {
  key?: Key
  emotion: EmotionId | number
  size?: number
  showName?: boolean
  dimmed?: boolean
}) {
  const size = props.size ?? 64
  const emotion = getEmotion(props.emotion)
  const alpha = props.dimmed ? 0.35 : 1
  const nameHeight = props.showName ? textHeight(FONT.tiny) : 0

  return (
    <UiEntity
      uiTransform={{
        width: size,
        height: size + nameHeight,
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
          borderWidth: Math.max(2, Math.round(size * 0.07)),
          borderColor: emotionColor(props.emotion, alpha)
        }}
        uiBackground={{ color: emotionShade(props.emotion, alpha) }}
      >
        <Text
          value={emotion.glyph}
          fontSize={Math.round(size * 0.4)}
          color={emotionColor(props.emotion, alpha)}
        />
      </UiEntity>
      {props.showName ? (
        <Text
          value={emotion.name}
          fontSize={FONT.tiny}
          color={emotionColor(props.emotion, alpha)}
        />
      ) : (
        false
      )}
    </UiEntity>
  )
}

/** A solid colour swatch used as a Color Match tap target. */
export function ColorTarget(props: {
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
        borderWidth: props.highlighted ? 5 : 0,
        borderColor: props.highlighted ? COLORS.text : COLORS.none,
        margin: { left: SPACE.sm, right: SPACE.sm },
        pointerFilter: props.onClick ? 'block' : 'none'
      }}
      uiBackground={{ color: emotionColor(props.emotion) }}
      onMouseDown={props.onClick}
    >
      <Text
        value={emotion.glyph}
        fontSize={Math.round(size * 0.32)}
        color={textOn(props.emotion)}
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
  const height = props.height ?? 16

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
          width: `${Math.round(clamped * 100)}%`,
          height,
          borderRadius: RADIUS.pill
        }}
        uiBackground={{ color: props.fill ?? COLORS.accent }}
      />
    </UiEntity>
  )
}

/** A compact labelled statistic, for the top strip. */
export function StatChip(props: {
  key?: Key
  label: string
  value: string
  color?: Color4
  width?: number
}) {
  return (
    <UiEntity
      uiTransform={{
        width: props.width ?? 84,
        height: 68,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <Text value={props.value} fontSize={FONT.heading} color={props.color ?? COLORS.text} />
      <Text value={props.label} fontSize={FONT.tiny} color={COLORS.textDim} />
    </UiEntity>
  )
}
