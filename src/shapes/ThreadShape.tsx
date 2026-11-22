/**
 * HILO ROJO — un hilo de verdad entre dos pines.
 *
 * - Está atado a sus dos extremos con un binding (`thread`). Si movés el pin,
 *   o la nota donde está clavado, el hilo lo sigue.
 * - FÍSICA: se simula como una cuerda (integración Verlet, ~22 nodos) con
 *   gravedad y largo fijo: cuelga con su peso (“panza”), se balancea cuando
 *   movés un extremo y se va frenando hasta quedar quieto. La simulación solo
 *   corre mientras hay movimiento y escribe el SVG directo (sin re-render).
 * - Se dibuja como hilo: sombra suave, trenzado (dos pasadas con guiones
 *   desfasados) y pelusa fina. Al aparecer se “tensa” de punta a punta.
 *
 * Herramienta Y: arrastrá de un pin (o una nota/foto/el corcho) a otro.
 * Si no hay pin donde empezás o terminás, se clava uno automáticamente.
 */
import { useEffect, useLayoutEffect, useRef } from 'react'
import {
  BindingOnShapeChangeOptions,
  BindingOnShapeDeleteOptions,
  BindingUtil,
  DefaultColorStyle,
  DefaultSizeStyle,
  Editor,
  Polyline2d,
  RecordProps,
  SVGContainer,
  ShapeUtil,
  StateNode,
  T,
  TLBinding,
  TLDefaultColorStyle,
  TLDefaultSizeStyle,
  TLShape,
  TLShapeId,
  Vec,
  createShapeId,
  react,
  useEditor,
} from 'tldraw'
import { reattach } from '../bindings/AttachBinding'
import { PIN_TYPE, PinShape, pinRadius } from './PinShape'
import { canAnimateMount, isPlaying } from './mountAnim'

export const THREAD_TYPE = 'thread' as const
export const THREAD_BINDING = 'thread' as const

declare module '@tldraw/tlschema' {
  export interface TLGlobalShapePropsMap {
    [THREAD_TYPE]: {
      color: TLDefaultColorStyle
      size: TLDefaultSizeStyle
      /** fin del hilo, relativo al origen del shape (= inicio) */
      endX: number
      endY: number
      /** largo extra respecto de la distancia entre puntas (0 = tenso) */
      slack: number
      material: 'wool' | 'twine' | 'nylon'
    }
  }
  export interface TLGlobalBindingPropsMap {
    [THREAD_BINDING]: { terminal: 'start' | 'end'; ax: number; ay: number }
  }
}

export type ThreadShape = TLShape<typeof THREAD_TYPE>
export type ThreadBinding = TLBinding<typeof THREAD_BINDING>

export const THREAD_COLORS: Record<string, string> = {
  black: '#1f1f1f', grey: '#8b8f96', 'light-violet': '#b691ff', violet: '#6d2fd6', blue: '#1f55c9',
  'light-blue': '#3aa7e0', yellow: '#e2b40f', orange: '#e2671a', green: '#1d8a42', 'light-green': '#48b862',
  'light-red': '#e85a6a', red: '#c4161c', white: '#f2f0ea',
}
const WIDTH: Record<TLDefaultSizeStyle, number> = { s: 2.2, m: 3.2, l: 4.6, xl: 6.4 }
const NODES = 22
const GRAVITY = 1800 // px/s² en unidades de página

/* ------------------------------------------------------------------ */
/* geometría “en reposo” (parábola ≈ catenaria) para seleccionar      */
/* ------------------------------------------------------------------ */

export function restCurve(endX: number, endY: number, slack: number, n = 24): Vec[] {
  const L = Math.hypot(endX, endY) || 1
  const Lr = L * (1 + slack)
  // flecha de una parábola de largo Lr sobre una cuerda L
  const sag = Math.sqrt(Math.max(0, (3 * L * (Lr - L)) / 8)) * (Math.abs(endX) / L * 0.85 + 0.15)
  const pts: Vec[] = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    pts.push(new Vec(endX * t, endY * t + 4 * sag * t * (1 - t)))
  }
  return pts
}

function pathFrom(pts: { x: number; y: number }[]) {
  if (pts.length < 2) return ''
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2
    const my = (pts[i].y + pts[i + 1].y) / 2
    d += ` Q${pts[i].x.toFixed(1)},${pts[i].y.toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`
  }
  const last = pts[pts.length - 1]
  return d + ` L${last.x.toFixed(1)},${last.y.toFixed(1)}`
}

/* ------------------------------------------------------------------ */

export class ThreadShapeUtil extends ShapeUtil<ThreadShape> {
  static override type = THREAD_TYPE
  static override props: RecordProps<ThreadShape> = {
    color: DefaultColorStyle,
    size: DefaultSizeStyle,
    endX: T.number,
    endY: T.number,
    slack: T.number,
    material: T.literalEnum('wool', 'twine', 'nylon'),
  }

  override getDefaultProps(): ThreadShape['props'] {
    return { color: 'red', size: 's', endX: 200, endY: 0, slack: 0.06, material: 'wool' }
  }

  override canResize() { return false }
  override hideRotateHandle() { return true }
  override hideSelectionBoundsFg() { return true }
  override hideSelectionBoundsBg() { return true }
  /** solo acepta sus propias ataduras (no flechas ni anclajes) */
  override canBind({ bindingType }: { bindingType: string }) {
    return bindingType === THREAD_BINDING
  }
  override canSnap() { return false }

  override getGeometry(shape: ThreadShape) {
    return new Polyline2d({ points: restCurve(shape.props.endX, shape.props.endY, shape.props.slack) })
  }

  override getIndicatorPath(shape: ThreadShape) {
    return new Path2D(pathFrom(restCurve(shape.props.endX, shape.props.endY, shape.props.slack)))
  }

  override onBeforeUpdate(prev: ThreadShape, next: ThreadShape) {
    if (prev.props.color !== next.props.color) lastThread.color = next.props.color
    if (prev.props.size !== next.props.size) lastThread.size = next.props.size
  }

  /** si arrastran el hilo suelto, vuelve a atarse a sus pines al soltar */
  override onTranslateEnd(_initial: ThreadShape, current: ThreadShape) {
    syncThread(this.editor, current.id)
  }

  override component(shape: ThreadShape) {
    return <ThreadComponent shape={shape} />
  }

  override toSvg(shape: ThreadShape) {
    const d = pathFrom(restCurve(shape.props.endX, shape.props.endY, shape.props.slack))
    const c = THREAD_COLORS[shape.props.color] ?? '#c4161c'
    const w = WIDTH[shape.props.size]
    return (
      <g>
        <path d={d} fill="none" stroke="rgba(0,0,0,.3)" strokeWidth={w + 1} strokeLinecap="round" transform="translate(3,5)" />
        <path d={d} fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" />
      </g>
    )
  }
}

/* ------------------------------------------------------------------ */
/* componente con física                                               */
/* ------------------------------------------------------------------ */

function ThreadComponent({ shape }: { shape: ThreadShape }) {
  const editor = useEditor()
  const refs = {
    shadow: useRef<SVGPathElement>(null),
    main: useRef<SVGPathElement>(null),
    twist: useRef<SVGPathElement>(null),
    fuzz: useRef<SVGPathElement>(null),
  }
  const groupRef = useRef<SVGGElement>(null)
  // se “tensa” al crearlo y al aparecer durante la reproducción
  const drawIn = useRef(canAnimateMount() || isPlaying())

  const color = THREAD_COLORS[shape.props.color] ?? '#c4161c'
  const w = WIDTH[shape.props.size]
  const mat = shape.props.material

  useLayoutEffect(() => {
    if (!drawIn.current || !groupRef.current) return
    groupRef.current.classList.add('cb-thread--draw')
    const t = setTimeout(() => groupRef.current?.classList.remove('cb-thread--draw'), 900)
    return () => clearTimeout(t)
  }, [])

  useRopeSimulation(editor, shape.id, (pts, ox, oy) => {
    const local = pts.map((p) => ({ x: p.x - ox, y: p.y - oy }))
    const d = pathFrom(local)
    for (const r of Object.values(refs)) r.current?.setAttribute('d', d)
  })

  const initial = pathFrom(restCurve(shape.props.endX, shape.props.endY, shape.props.slack))
  return (
    <SVGContainer style={{ overflow: 'visible' }}>
      <g ref={groupRef} className={`cb-thread cb-thread--${mat}`}>
        <path ref={refs.shadow} d={initial} className="cb-thread__shadow" strokeWidth={w + 1.2} pathLength={1} />
        <path ref={refs.main} d={initial} stroke={color} strokeWidth={w} className="cb-thread__main" pathLength={1} />
        <path
          ref={refs.twist}
          d={initial}
          className="cb-thread__twist"
          strokeWidth={w * 0.5}
          strokeDasharray={mat === 'nylon' ? 'none' : `${(w * 1.3).toFixed(1)} ${(w * 1.5).toFixed(1)}`}
        />
        <path ref={refs.fuzz} d={initial} className="cb-thread__fuzz" stroke={color} strokeWidth={w + 1.6} />
      </g>
    </SVGContainer>
  )
}

/**
 * Cuerda Verlet: los nodos se mueven por inercia + gravedad y después se
 * corrigen para respetar el largo de cada tramo. Las puntas siguen a los pines.
 */
function useRopeSimulation(editor: Editor, id: TLShapeId, draw: (pts: Vec[], ox: number, oy: number) => void) {
  const drawRef = useRef(draw)
  drawRef.current = draw
  useEffect(() => {
    let pts: Vec[] = []
    let prev: Vec[] = []
    let raf = 0
    let running = false
    let quiet = 0
    let last = performance.now()

    const ends = () => {
      const s = editor.getShape<ThreadShape>(id)
      if (!s) return null
      const a = editor.getShapePageTransform(s).point()
      return { s, a, b: new Vec(a.x + s.props.endX, a.y + s.props.endY) }
    }

    const init = () => {
      const e = ends()
      if (!e) return
      pts = restCurve(e.s.props.endX, e.s.props.endY, e.s.props.slack, NODES).map((p) => p.add(e.a))
      prev = pts.map((p) => p.clone())
    }
    init()

    const step = (now: number) => {
      const e = ends()
      if (!e) return
      const dt = Math.min(1 / 30, (now - last) / 1000) || 1 / 60
      last = now
      const L = Vec.Dist(e.a, e.b) * (1 + e.s.props.slack)
      const seg = L / (NODES - 1)
      let motion = 0
      // integración
      for (let i = 1; i < NODES - 1; i++) {
        const p = pts[i]
        const vx = (p.x - prev[i].x) * 0.985
        const vy = (p.y - prev[i].y) * 0.985
        prev[i] = p.clone()
        p.x += vx
        p.y += vy + GRAVITY * dt * dt
        motion = Math.max(motion, Math.abs(vx) + Math.abs(vy))
      }
      // puntas fijas a los pines
      pts[0].x = e.a.x; pts[0].y = e.a.y
      pts[NODES - 1].x = e.b.x; pts[NODES - 1].y = e.b.y
      // restricciones de largo
      for (let k = 0; k < 14; k++) {
        for (let i = 0; i < NODES - 1; i++) {
          const p = pts[i], q = pts[i + 1]
          const dx = q.x - p.x, dy = q.y - p.y
          const dist = Math.hypot(dx, dy) || 1e-6
          const diff = (dist - seg) / dist
          const fp = i === 0 ? 0 : i + 1 === NODES - 1 ? 1 : 0.5
          const fq = i + 1 === NODES - 1 ? 0 : i === 0 ? 1 : 0.5
          p.x += dx * diff * fp; p.y += dy * diff * fp
          q.x -= dx * diff * fq; q.y -= dy * diff * fq
        }
      }
      drawRef.current(pts, e.a.x, e.a.y)
      quiet = motion < 0.03 ? quiet + dt : 0
      if (quiet > 0.6) {
        running = false
        return
      }
      raf = requestAnimationFrame(step)
    }

    const wake = () => {
      if (running) return
      running = true
      quiet = 0
      last = performance.now()
      raf = requestAnimationFrame(step)
    }
    const stop = react('thread-ends', () => {
      const s = editor.getShape<ThreadShape>(id)
      if (s) editor.getShapePageTransform(s) // dependencia: posición y props
      wake()
    })
    return () => {
      stop()
      cancelAnimationFrame(raf)
    }
  }, [editor, id])
}

/* ------------------------------------------------------------------ */
/* binding: puntas atadas a pines (o a cualquier objeto)              */
/* ------------------------------------------------------------------ */

export class ThreadBindingUtil extends BindingUtil<ThreadBinding> {
  static override type = THREAD_BINDING
  static override props: RecordProps<ThreadBinding> = {
    terminal: T.literalEnum('start', 'end'),
    ax: T.number,
    ay: T.number,
  }
  override getDefaultProps() {
    return { terminal: 'start' as const, ax: 0.5, ay: 0.5 }
  }
  override onAfterChangeToShape({ binding }: BindingOnShapeChangeOptions<ThreadBinding>) {
    syncThread(this.editor, binding.fromId)
  }
  /** sin pin no hay hilo: se cae con él */
  override onBeforeDeleteToShape({ binding }: BindingOnShapeDeleteOptions<ThreadBinding>) {
    if (this.editor.getShape(binding.fromId)) this.editor.deleteShape(binding.fromId)
  }
}

function anchorPoint(editor: Editor, b: ThreadBinding) {
  const target = editor.getShape(b.toId)
  if (!target) return null
  const bounds = editor.getShapeGeometry(target).bounds
  return editor.getShapePageTransform(target).applyToPoint({ x: bounds.x + b.props.ax * bounds.w, y: bounds.y + b.props.ay * bounds.h })
}

/** Reubica las puntas del hilo según sus bindings. */
export function syncThread(editor: Editor, threadId: TLShapeId) {
  const thread = editor.getShape<ThreadShape>(threadId)
  if (!thread) return
  const bs = editor.getBindingsFromShape<ThreadBinding>(thread, THREAD_BINDING)
  const start = bs.find((b) => b.props.terminal === 'start')
  const end = bs.find((b) => b.props.terminal === 'end')
  const origin = editor.getShapePageTransform(thread).point()
  const a = (start && anchorPoint(editor, start)) || origin
  const b = (end && anchorPoint(editor, end)) || { x: origin.x + thread.props.endX, y: origin.y + thread.props.endY }
  const local = editor.getPointInParentSpace(thread, a)
  if (
    Math.abs(local.x - thread.x) < 0.01 && Math.abs(local.y - thread.y) < 0.01 &&
    Math.abs(b.x - a.x - thread.props.endX) < 0.01 && Math.abs(b.y - a.y - thread.props.endY) < 0.01
  ) return
  editor.updateShape<ThreadShape>({
    id: thread.id,
    type: THREAD_TYPE,
    x: local.x,
    y: local.y,
    props: { endX: b.x - a.x, endY: b.y - a.y },
  })
}

export function bindThreadEnd(editor: Editor, threadId: TLShapeId, terminal: 'start' | 'end', targetId: TLShapeId) {
  const old = editor.getBindingsFromShape<ThreadBinding>(threadId, THREAD_BINDING).find((b) => b.props.terminal === terminal)
  if (old) editor.deleteBinding(old.id)
  editor.createBinding<ThreadBinding>({ type: THREAD_BINDING, fromId: threadId, toId: targetId, props: { terminal, ax: 0.5, ay: 0.5 } })
  syncThread(editor, threadId)
}

/* ------------------------------------------------------------------ */
/* herramienta Y                                                        */
/* ------------------------------------------------------------------ */

/** Devuelve un pin en ese punto: el que ya está, o uno nuevo clavado en lo que haya debajo. */
function pinAt(editor: Editor, point: Vec, exclude: TLShapeId[] = []): { id: TLShapeId; created: boolean } {
  const hit = editor.getShapeAtPoint(point, {
    hitInside: true,
    margin: 4,
    filter: (s) => s.type === PIN_TYPE && !exclude.includes(s.id),
  })
  if (hit) return { id: hit.id, created: false }
  const id = createShapeId()
  const r = pinRadius('m')
  editor.createShape<PinShape>({ id, type: PIN_TYPE, x: point.x - r, y: point.y - r, props: { color: 'red', size: 'm' } })
  reattach(editor, [id]) // se clava en la nota / foto de abajo, si hay
  return { id, created: true }
}

/** el próximo hilo usa el último color/grosor elegido (por defecto: rojo fino) */
const lastThread: { color: TLDefaultColorStyle; size: TLDefaultSizeStyle } = { color: 'red', size: 's' }

export class ThreadTool extends StateNode {
  static override id = 'thread'
  private threadId: TLShapeId | null = null
  private startPoint = new Vec()

  override onEnter() {
    this.editor.setCursor({ type: 'cross', rotation: 0 })
  }

  override onPointerDown() {
    const editor = this.editor
    const p = editor.inputs.getCurrentPagePoint().clone()
    this.startPoint = p
    editor.markHistoryStoppingPoint('thread')
    const start = pinAt(editor, p)
    const pin = editor.getShape(start.id)!
    const c = editor.getShapePageBounds(pin)!.center
    const id = createShapeId()
    editor.createShape<ThreadShape>({
      id, type: THREAD_TYPE, x: c.x, y: c.y,
      props: { endX: 0.1, endY: 0.1, color: lastThread.color, size: lastThread.size },
    })
    bindThreadEnd(editor, id, 'start', start.id)
    this.threadId = id
  }

  override onPointerMove() {
    if (!this.threadId) return
    const t = this.editor.getShape<ThreadShape>(this.threadId)
    if (!t) return
    const p = this.editor.inputs.getCurrentPagePoint()
    const o = this.editor.getShapePageTransform(t).point()
    this.editor.updateShape<ThreadShape>({ id: t.id, type: THREAD_TYPE, props: { endX: p.x - o.x, endY: p.y - o.y } })
  }

  override onPointerUp() {
    const editor = this.editor
    const id = this.threadId
    this.threadId = null
    if (!id) return
    const p = editor.inputs.getCurrentPagePoint().clone()
    if (Vec.Dist(p, this.startPoint) < 12) {
      // fue un clic: dejamos solo el pin
      editor.deleteShape(id)
    } else {
      const startPin = editor.getBindingsFromShape<ThreadBinding>(id, THREAD_BINDING)[0]?.toId
      const end = pinAt(editor, p, startPin ? [startPin] : [])
      bindThreadEnd(editor, id, 'end', end.id)
      // los pines por encima del hilo
      const pins = editor.getBindingsFromShape<ThreadBinding>(id, THREAD_BINDING).map((b) => b.toId)
      editor.bringToFront(pins)
    }
    if (!editor.getInstanceState().isToolLocked) editor.setCurrentTool('select')
  }

  override onCancel() {
    if (this.threadId) this.editor.deleteShape(this.threadId)
    this.threadId = null
    this.editor.setCurrentTool('select')
  }
}

/** Ids de los objetos a los que está atado un hilo. */
export function threadEnds(editor: Editor, threadId: TLShapeId) {
  return editor.getBindingsFromShape<ThreadBinding>(threadId, THREAD_BINDING).map((b) => b.toId)
}
