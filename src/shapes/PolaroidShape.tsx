/**
 * POLAROID — imagen con marco fotográfico + caption.
 *
 * frame:
 *  - 'polaroid' → borde blanco con franja inferior ancha (clásico)
 *  - 'clean'    → marco fino uniforme; el caption aparece debajo si existe
 *  - 'none'     → solo la imagen; el caption va sobre una franja oscura
 *
 * Doble clic (o Enter) para editar el caption directamente sobre la foto.
 * El color del texto usa el selector de color nativo de tldraw.
 */
import { useLayoutEffect, useRef } from 'react'
import {
  BaseBoxShapeUtil,
  DefaultColorStyle,
  Editor,
  HTMLContainer,
  RecordProps,
  T,
  TLAssetId,
  TLDefaultColorStyle,
  TLImageShape,
  TLShape,
  TLShapeId,
  createShapeId,
  useEditor,
  useImageOrVideoAsset,
  useValue,
} from 'tldraw'

export const POLAROID_TYPE = 'polaroid' as const

export type PolaroidFrame = 'polaroid' | 'clean' | 'none'
export type CaptionFont = 'marker' | 'hand' | 'typewriter' | 'sans'

declare module '@tldraw/tlschema' {
  export interface TLGlobalShapePropsMap {
    [POLAROID_TYPE]: {
      w: number
      h: number
      assetId: TLAssetId | null
      caption: string
      captionSize: number
      captionFont: CaptionFont
      captionAlign: 'start' | 'middle' | 'end'
      bold: boolean
      italic: boolean
      color: TLDefaultColorStyle
      frame: PolaroidFrame
      shadow: boolean
    }
  }
}

export type PolaroidShape = TLShape<typeof POLAROID_TYPE>

export const CAPTION_FONTS: Record<CaptionFont, string> = {
  marker: "'Permanent Marker', 'Comic Sans MS', cursive",
  hand: "'Caveat', 'Segoe Print', cursive",
  typewriter: "'Special Elite', 'Courier New', monospace",
  sans: "'Inter', system-ui, sans-serif",
}

export const INK: Record<string, string> = {
  black: '#1d1d1d', grey: '#6b7280', 'light-violet': '#a78bfa', violet: '#6d28d9', blue: '#1d4ed8',
  'light-blue': '#0ea5e9', yellow: '#ca8a04', orange: '#ea580c', green: '#15803d', 'light-green': '#22c55e',
  'light-red': '#f43f5e', red: '#c81e1e', white: '#ffffff',
}

/** Calcula el rectángulo de la foto y el área del caption dentro del marco. */
export function polaroidLayout(p: PolaroidShape['props']) {
  const { w, h, frame, caption, captionSize } = p
  if (frame === 'none') {
    return { img: { x: 0, y: 0, w, h }, cap: { x: 0, y: h - captionSize * 2.6, w, h: captionSize * 2.6 }, overlay: true }
  }
  if (frame === 'clean') {
    const pad = Math.max(4, w * 0.025)
    const capH = caption.trim() ? captionSize * 2.2 : 0
    return {
      img: { x: pad, y: pad, w: w - pad * 2, h: h - pad * 2 - capH },
      cap: { x: pad, y: h - pad - capH, w: w - pad * 2, h: capH },
      overlay: false,
    }
  }
  const pad = Math.max(6, w * 0.055)
  const bottom = Math.max(w * 0.2, captionSize * 2.4 + pad)
  return {
    img: { x: pad, y: pad, w: w - pad * 2, h: Math.max(10, h - pad - bottom) },
    cap: { x: pad, y: h - bottom, w: w - pad * 2, h: bottom },
    overlay: false,
  }
}

export class PolaroidShapeUtil extends BaseBoxShapeUtil<PolaroidShape> {
  static override type = POLAROID_TYPE
  static override props: RecordProps<PolaroidShape> = {
    w: T.number,
    h: T.number,
    assetId: T.string.nullable() as any,
    caption: T.string,
    captionSize: T.number,
    captionFont: T.literalEnum('marker', 'hand', 'typewriter', 'sans'),
    captionAlign: T.literalEnum('start', 'middle', 'end'),
    bold: T.boolean,
    italic: T.boolean,
    color: DefaultColorStyle,
    frame: T.literalEnum('polaroid', 'clean', 'none'),
    shadow: T.boolean,
  }

  override getDefaultProps(): PolaroidShape['props'] {
    return {
      w: 320,
      h: 380,
      assetId: null,
      caption: '',
      captionSize: 22,
      captionFont: 'marker',
      captionAlign: 'middle',
      bold: false,
      italic: false,
      color: 'black',
      frame: 'polaroid',
      shadow: true,
    }
  }

  override canEdit() { return true }
  override canBind() { return true }
  override getText(shape: PolaroidShape) { return shape.props.caption }

  override getIndicatorPath(shape: PolaroidShape) {
    const p = new Path2D()
    p.rect(0, 0, shape.props.w, shape.props.h)
    return p
  }

  override component(shape: PolaroidShape) {
    return <PolaroidComponent shape={shape} />
  }

  override toSvg(shape: PolaroidShape) {
    const L = polaroidLayout(shape.props)
    const asset = shape.props.assetId ? this.editor.getAsset(shape.props.assetId) : null
    const src = (asset?.props as any)?.src as string | undefined
    const clip = `clip-${shape.id.replace(/[^a-z0-9]/gi, '')}`
    const anchor = shape.props.captionAlign
    const tx = anchor === 'start' ? L.cap.x + 6 : anchor === 'end' ? L.cap.x + L.cap.w - 6 : L.cap.x + L.cap.w / 2
    return (
      <g>
        {shape.props.frame !== 'none' && <rect width={shape.props.w} height={shape.props.h} fill="#fbfaf6" />}
        <defs>
          <clipPath id={clip}><rect x={L.img.x} y={L.img.y} width={L.img.w} height={L.img.h} /></clipPath>
        </defs>
        {src ? (
          <image href={src} x={L.img.x} y={L.img.y} width={L.img.w} height={L.img.h} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clip})`} />
        ) : (
          <rect x={L.img.x} y={L.img.y} width={L.img.w} height={L.img.h} fill="#ccc" />
        )}
        {shape.props.caption && (
          <text
            x={tx}
            y={L.cap.y + L.cap.h / 2}
            dominantBaseline="middle"
            textAnchor={anchor}
            fontFamily={CAPTION_FONTS[shape.props.captionFont]}
            fontSize={shape.props.captionSize}
            fontWeight={shape.props.bold ? 700 : 400}
            fontStyle={shape.props.italic ? 'italic' : 'normal'}
            fill={L.overlay ? '#fff' : INK[shape.props.color]}
          >
            {shape.props.caption.split('\n')[0]}
          </text>
        )}
      </g>
    )
  }
}

function PolaroidComponent({ shape }: { shape: PolaroidShape }) {
  const editor = useEditor()
  const p = shape.props
  const L = polaroidLayout(p)
  const { url } = useImageOrVideoAsset({ shapeId: shape.id, assetId: p.assetId, width: p.w })
  const isEditing = useValue('editing', () => editor.getEditingShapeId() === shape.id, [editor, shape.id])
  const taRef = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    if (!isEditing) return
    const ta = taRef.current
    if (!ta) return
    const focus = () => {
      ta.focus()
      ta.setSelectionRange(ta.value.length, ta.value.length) // cursor al final
    }
    focus()
    // tldraw devuelve el foco al lienzo al soltar el doble clic: lo recuperamos
    const t1 = editor.timers.setTimeout(focus, 0)
    const t2 = editor.timers.setTimeout(() => document.activeElement !== ta && focus(), 80)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [isEditing, editor])

  const align = p.captionAlign === 'start' ? 'left' : p.captionAlign === 'end' ? 'right' : 'center'
  const captionStyle: React.CSSProperties = {
    left: L.cap.x,
    top: L.cap.y,
    width: L.cap.w,
    height: L.cap.h,
    fontFamily: CAPTION_FONTS[p.captionFont],
    fontSize: p.captionSize,
    fontWeight: p.bold ? 700 : 400,
    fontStyle: p.italic ? 'italic' : 'normal',
    textAlign: align,
    color: L.overlay ? '#fff' : INK[p.color],
  }

  return (
    <HTMLContainer
      className={`cb-polaroid cb-polaroid--${p.frame} ${p.shadow ? 'has-shadow' : ''}`}
      style={{ width: p.w, height: p.h, pointerEvents: 'all' }}
    >
      <div className="cb-polaroid__photo" style={{ left: L.img.x, top: L.img.y, width: L.img.w, height: L.img.h }}>
        {url ? <img src={url} draggable={false} alt="" /> : <div className="cb-polaroid__empty">Pegá o soltá una imagen</div>}
      </div>
      {L.overlay && (p.caption || isEditing) && (
        <div className="cb-polaroid__overlay" style={{ top: L.cap.y, height: L.cap.h }} />
      )}
      {isEditing ? (
        <textarea
          ref={taRef}
          className="cb-polaroid__caption cb-polaroid__caption--edit"
          style={captionStyle}
          value={p.caption}
          placeholder="Escribí un caption…"
          onPointerDown={(e) => editor.markEventAsHandled(e)}
          onChange={(e) =>
            editor.updateShape<PolaroidShape>({ id: shape.id, type: POLAROID_TYPE, props: { caption: e.target.value } })
          }
          onKeyDown={(e) => {
            if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
              e.preventDefault()
              editor.setEditingShape(null)
            }
          }}
        />
      ) : (
        p.caption && (
          <div className="cb-polaroid__caption" style={captionStyle}>
            {p.caption}
          </div>
        )
      )}
    </HTMLContainer>
  )
}

/* ------------------------------------------------------------------ */
/* Conversión imagen ⇄ polaroid                                        */
/* ------------------------------------------------------------------ */

export function convertImageToPolaroid(editor: Editor, image: TLImageShape): TLShapeId {
  const { w, h, assetId } = image.props
  // agrandamos el marco para que la foto conserve su tamaño visible
  const base: PolaroidShape['props'] = { ...new PolaroidShapeUtil(editor).getDefaultProps(), w, h, assetId }
  // inversa de polaroidLayout(): marco tal que el área de foto == w × h
  base.captionSize = Math.round(Math.max(14, Math.min(48, w * 0.065)))
  const fw = Math.max(w / 0.89, w + 12)
  const pad = Math.max(6, fw * 0.055)
  const bottom = Math.max(fw * 0.2, base.captionSize * 2.4 + pad)
  const fh = h + pad + bottom
  const id = createShapeId()
  editor.run(() => {
    editor.createShape<PolaroidShape>({
      id,
      type: POLAROID_TYPE,
      parentId: image.parentId,
      x: image.x - (fw - w) / 2,
      y: image.y - pad,
      rotation: image.rotation,
      index: image.index,
      props: { ...base, w: fw, h: fh },
    })
    editor.deleteShape(image.id)
  })
  return id
}

export function convertPolaroidToImage(editor: Editor, shape: PolaroidShape): TLShapeId | null {
  if (!shape.props.assetId) return null
  const L = polaroidLayout(shape.props)
  const id = createShapeId()
  editor.run(() => {
    editor.createShape<TLImageShape>({
      id,
      type: 'image',
      parentId: shape.parentId,
      x: shape.x + L.img.x,
      y: shape.y + L.img.y,
      rotation: shape.rotation,
      index: shape.index,
      props: { w: L.img.w, h: L.img.h, assetId: shape.props.assetId },
    })
    editor.deleteShape(shape.id)
  })
  return id
}
