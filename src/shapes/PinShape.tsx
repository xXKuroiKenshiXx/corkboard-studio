/**
 * PIN — chinche/alfiler de tablero.
 *
 * - Hitbox generoso: el área clicable es un círculo bastante más grande que la
 *   cabeza visible, así es fácil de agarrar incluso con zoom lejano.
 * - Física de péndulo: la cabeza se inclina y el colgante (cuerda / etiqueta)
 *   se balancea según la aceleración del pin. La simulación corre en un rAF
 *   propio y escribe transformaciones directo en el DOM (sin re-render).
 * - Cuando se coloca sobre una nota / imagen se crea un binding `attach`
 *   (ver bindings/AttachBinding.ts) y el pin viaja con ese objeto.
 */
import { useEffect, useRef, useState } from 'react'
import { canAnimateMount } from './mountAnim'
import {
  Circle2d,
  DefaultColorStyle,
  DefaultSizeStyle,
  Editor,
  HTMLContainer,
  RecordProps,
  ShapeUtil,
  StateNode,
  T,
  TLDefaultColorStyle,
  TLDefaultSizeStyle,
  TLShape,
  TLShapeId,
  createShapeId,
  react,
  useEditor,
  useValue,
} from 'tldraw'

export const PIN_TYPE = 'pin' as const

declare module '@tldraw/tlschema' {
  export interface TLGlobalShapePropsMap {
    [PIN_TYPE]: {
      color: TLDefaultColorStyle
      size: TLDefaultSizeStyle
      dangle: 'none' | 'string' | 'tag'
      label: string
    }
  }
}

export type PinShape = TLShape<typeof PIN_TYPE>

export const PIN_COLORS: Record<string, string> = {
  black: '#222',
  grey: '#8a8f98',
  'light-violet': '#c08cff',
  violet: '#7d3cff',
  blue: '#2563eb',
  'light-blue': '#38bdf8',
  yellow: '#f5c518',
  orange: '#f97316',
  green: '#16a34a',
  'light-green': '#4ade80',
  'light-red': '#fb7185',
  red: '#e0262f',
  white: '#f5f5f5',
}

/** diámetro visible de la cabeza según tamaño */
const HEAD: Record<TLDefaultSizeStyle, number> = { s: 18, m: 26, l: 34, xl: 46 }
/** radio del hitbox: siempre bastante más grande que la cabeza */
export const pinRadius = (size: TLDefaultSizeStyle) => Math.max(22, HEAD[size] * 0.95)

export class PinShapeUtil extends ShapeUtil<PinShape> {
  static override type = PIN_TYPE
  static override props: RecordProps<PinShape> = {
    color: DefaultColorStyle,
    size: DefaultSizeStyle,
    dangle: T.literalEnum('none', 'string', 'tag'),
    label: T.string,
  }

  override getDefaultProps(): PinShape['props'] {
    return { color: 'red', size: 'm', dangle: 'none', label: '' }
  }

  override canResize() { return false }
  override hideRotateHandle() { return true }
  override hideSelectionBoundsBg() { return true }
  override hideSelectionBoundsFg() { return true }
  override canEdit() { return false }
  override canBind() { return true }

  override onBeforeUpdate(prev: PinShape, next: PinShape) {
    if (prev.props.color !== next.props.color) rememberPinColor(next.props.color)
  }

  override getGeometry(shape: PinShape) {
    const r = pinRadius(shape.props.size)
    return new Circle2d({ x: 0, y: 0, radius: r, isFilled: true })
  }

  override getIndicatorPath(shape: PinShape) {
    const r = pinRadius(shape.props.size)
    const p = new Path2D()
    p.arc(r, r, HEAD[shape.props.size] / 2 + 5, 0, Math.PI * 2)
    return p
  }

  override component(shape: PinShape) {
    return <PinComponent shape={shape} />
  }

  override toSvg(shape: PinShape) {
    const r = pinRadius(shape.props.size)
    const head = HEAD[shape.props.size] / 2
    const c = PIN_COLORS[shape.props.color] ?? '#e0262f'
    return (
      <g>
        <ellipse cx={r + 4} cy={r + 5} rx={head} ry={head * 0.8} fill="rgba(0,0,0,.35)" />
        <circle cx={r} cy={r} r={head} fill={c} />
        <circle cx={r - head * 0.3} cy={r - head * 0.35} r={head * 0.35} fill="rgba(255,255,255,.55)" />
      </g>
    )
  }
}

/* ------------------------------------------------------------------ */

function PinComponent({ shape }: { shape: PinShape }) {
  const editor = useEditor()
  const headRef = useRef<HTMLDivElement>(null)
  const dangleRef = useRef<HTMLDivElement>(null)
  const shadowRef = useRef<HTMLDivElement>(null)

  const r = pinRadius(shape.props.size)
  const head = HEAD[shape.props.size]
  const color = PIN_COLORS[shape.props.color] ?? '#e0262f'

  // “levantado” cuando se está arrastrando este pin
  const lifted = useValue(
    'pin-lifted',
    () =>
      editor.isIn('select.translating') && editor.getSelectedShapeIds().includes(shape.id),
    [editor, shape.id]
  )

  // animación de “clavar” al ponerlo en el tablero
  const [dropping, setDropping] = useState(() => canAnimateMount())
  useEffect(() => {
    if (!dropping) return
    const t = setTimeout(() => setDropping(false), 800)
    return () => clearTimeout(t)
  }, [dropping])

  usePendulum(editor, shape.id, (tilt, swing) => {
    if (headRef.current) headRef.current.style.transform = `translate(-50%,-50%) rotate(${tilt}deg)`
    if (dangleRef.current) dangleRef.current.style.transform = `rotate(${swing}deg)`
    if (shadowRef.current) shadowRef.current.style.transform = `translate(${4 + tilt * 0.2}px, 6px)`
  })

  return (
    <HTMLContainer style={{ width: r * 2, height: r * 2, pointerEvents: 'all' }}>
      <div
        className={`cb-pin ${lifted ? 'is-lifted' : ''} ${dropping ? 'is-dropping' : ''}`}
        style={{ ['--pin' as any]: color, ['--head' as any]: `${head}px`, ['--r' as any]: `${r}px` }}
      >
        {dropping && <div className="cb-pin__dust" style={{ left: r, top: r }} />}
        {shape.props.dangle !== 'none' && (
          <div ref={dangleRef} className="cb-pin__dangle" style={{ left: r, top: r }}>
            <div className="cb-pin__string" />
            {shape.props.dangle === 'tag' && (
              <div className="cb-pin__tag">{shape.props.label || 'Evidencia'}</div>
            )}
          </div>
        )}
        <div ref={shadowRef} className="cb-pin__shadow" style={{ left: r - head / 2, top: r - head / 2 }} />
        <div ref={headRef} className="cb-pin__head" style={{ left: r, top: r }}>
          <div className="cb-pin__needle" />
          <div className="cb-pin__cap" />
        </div>
      </div>
    </HTMLContainer>
  )
}

/**
 * Péndulo amortiguado excitado por la aceleración del pin en pantalla.
 * Solo corre mientras hay movimiento; luego se duerme hasta el próximo cambio.
 */
function usePendulum(editor: Editor, id: TLShapeId, apply: (tilt: number, swing: number) => void) {
  const applyRef = useRef(apply)
  applyRef.current = apply
  useEffect(() => {
    let raf = 0
    let running = false
    let last = editor.getShapePageBounds(id)?.center ?? { x: 0, y: 0 }
    let vx = 0
    let vy = 0
    let swing = 0 // ángulo del colgante (deg)
    let swingV = 0
    let tilt = 0 // inclinación de la cabeza
    let tiltV = 0
    let lastT = performance.now()
    let quiet = 0

    const step = (t: number) => {
      const dt = Math.min(0.05, (t - lastT) / 1000) || 0.016
      lastT = t
      const p = editor.getShapePageBounds(id)?.center
      if (!p) return
      const nvx = (p.x - last.x) / dt
      const nvy = (p.y - last.y) / dt
      const ax = (nvx - vx) / dt
      const ay = (nvy - vy) / dt
      vx = nvx
      vy = nvy
      last = p
      // péndulo: θ'' = -k·θ - c·θ' - a_x·m
      const force = Math.max(-4000, Math.min(4000, ax)) * 0.012 + Math.max(-4000, Math.min(4000, ay)) * 0.002
      swingV += (-38 * swing - 3.2 * swingV - force) * dt
      swing += swingV * dt
      tiltV += (-160 * tilt - 12 * tiltV - force * 0.5) * dt
      tilt += tiltV * dt
      swing = Math.max(-70, Math.min(70, swing))
      tilt = Math.max(-25, Math.min(25, tilt))
      applyRef.current(tilt, swing)

      const moving = Math.abs(nvx) + Math.abs(nvy) > 1
      const settled = Math.abs(swing) < 0.05 && Math.abs(swingV) < 0.05 && Math.abs(tilt) < 0.05
      quiet = moving || !settled ? 0 : quiet + dt
      if (quiet > 0.3) {
        running = false
        applyRef.current(0, 0)
        return
      }
      raf = requestAnimationFrame(step)
    }

    const wake = () => {
      if (running) return
      running = true
      lastT = performance.now()
      quiet = 0
      raf = requestAnimationFrame(step)
    }

    const stop = react('pin-motion', () => {
      editor.getShapePageBounds(id) // dependencia reactiva
      wake()
    })
    return () => {
      stop()
      cancelAnimationFrame(raf)
    }
  }, [editor, id])
}

/* ------------------------------------------------------------------ */
/* Herramienta “Pin” (atajo P)                                          */
/* ------------------------------------------------------------------ */

let lastPinColor: TLDefaultColorStyle = 'red'
export function rememberPinColor(c: TLDefaultColorStyle) {
  lastPinColor = c
}

export class PinTool extends StateNode {
  static override id = 'pin'

  override onEnter() {
    this.editor.setCursor({ type: 'cross', rotation: 0 })
  }

  override onPointerDown() {
    const { x, y } = this.editor.inputs.getCurrentPagePoint()
    const id = createShapeId()
    const size: TLDefaultSizeStyle = 'm'
    const r = pinRadius(size)
    this.editor.markHistoryStoppingPoint('create pin')
    this.editor.createShape<PinShape>({
      id,
      type: PIN_TYPE,
      x: x - r,
      y: y - r,
      // el pin recuerda el último color usado en un pin (por defecto rojo)
      props: { size, color: lastPinColor },
    })
    // anclar al objeto que esté debajo (nota, imagen, polaroid...)
    this.editor.emit('cb:attach-check' as any, [id])
    if (!this.editor.getInstanceState().isToolLocked) {
      this.editor.setCurrentTool('select')
      this.editor.select(id)
    }
  }

  override onCancel() {
    this.editor.setCurrentTool('select')
  }
}
