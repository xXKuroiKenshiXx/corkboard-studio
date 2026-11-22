/**
 * MOTOR DEL MODO REPRODUCCIÓN (línea de tiempo determinista)
 *
 * Al dar Play se construye una línea de tiempo con un segmento por escena:
 *
 *   t0 ──[ transición ]── t1 ──[ pausa + Ken Burns + linterna animada ]── t2
 *
 * Todas las cámaras de inicio/fin se calculan de antemano, así que
 * `evaluate(t)` es una función pura del tiempo: se puede saltar a cualquier
 * instante (barra de tiempo arrastrable), retroceder, pausar, y la
 * grabación sale idéntica a la vista previa.
 *
 * Capas que se actualizan en cada frame:
 *  - cámara (`editor.setCamera(..., {immediate})`)
 *  - filtros del lienzo (blur, barrido, glitch, color) → estilo de `.tl-canvas`
 *  - entradas de objetos (“clavar”, pop…) → <style id="cb-anim">
 *  - objetos ocultos hasta su escena → átomo `hiddenIds` (getShapeVisibility)
 *  - efectos de overlay (linterna, barras, fundido, glitch) → átomo `fx`
 */
import { Box, Editor, TLShapeId, atom } from 'tldraw'
import { ColorGrade, Scene, ShowData, Transition, getShow } from '../board/settings'
import { ATTACH_TYPE } from '../bindings/AttachBinding'
import { CAMFRAME_TYPE } from '../shapes/CameraFrameShape'
import { PIN_TYPE } from '../shapes/PinShape'
import { THREAD_BINDING, THREAD_TYPE, ThreadBinding, ThreadShape, restCurve } from '../shapes/ThreadShape'
import { EASINGS, clamp01, lerp } from './easing'
import { ENTRANCE_DURATION, entranceStyle, pinPressStyle, styleToCss } from './entrances'
import { spotAnimAt } from './spotAnim'

export type PlayerStatus = 'idle' | 'playing' | 'paused'

interface Cam { cx: number; cy: number; z: number }
interface PageSpot { cx: number; cy: number; rx: number; ry: number; a: number }

interface Seg {
  scene: Scene
  index: number
  tr: Transition
  t0: number
  t1: number
  t2: number
  from: Cam
  to: Cam
  bounds: Box
  spotOn: boolean
  entranceAt: number
  attached: { id: TLShapeId; isPin: boolean }[]
  /** recorrido para la transición “Seguir el hilo” (puntos de página + largo acumulado) */
  path?: { pts: { x: number; y: number }[]; acc: number[]; threadId: TLShapeId; backward: boolean }
}

export interface Fx {
  spot: { x: number; y: number; rx: number; ry: number } | null
  spotAlpha: number
  fade: number
  glitch: number
  letterbox: number
  t: number
  total: number
}

export interface TimelineInfo {
  total: number
  marks: { t: number; label: string; index: number }[]
}

const ZERO_FX: Fx = { spot: null, spotAlpha: 0, fade: 0, glitch: 0, letterbox: 0, t: 0, total: 0 }

export const GRADE_FILTERS: Record<ColorGrade, string> = {
  none: '',
  noir: 'grayscale(1) contrast(1.25) brightness(0.92)',
  sepia: 'sepia(0.55) saturate(1.15) contrast(1.05)',
  warm: 'sepia(0.22) saturate(1.3) hue-rotate(-8deg)',
  cold: 'saturate(0.8) hue-rotate(14deg) contrast(1.12) brightness(0.97)',
  vivid: 'saturate(1.28) contrast(1.06)',
}

export class Player {
  readonly status = atom<PlayerStatus>('player.status', 'idle')
  readonly index = atom('player.index', 0)
  readonly fx = atom<Fx>('player.fx', ZERO_FX)
  readonly recording = atom('player.recording', false)
  readonly timeline = atom<TimelineInfo>('player.timeline', { total: 0, marks: [] })
  /** objetos ocultos porque todavía no les tocó su escena */
  readonly hiddenIds = atom<Set<TLShapeId>>('player.hidden', new Set())

  private raf = 0
  private t = 0
  private lastNow = 0
  private until = Infinity
  private segs: Seg[] = []
  private total = 0
  private show!: ShowData
  private startCam: Cam = { cx: 0, cy: 0, z: 1 }
  private savedCamera: { x: number; y: number; z: number } | null = null
  private onEnd: (() => void) | null = null
  private ending = false
  private hiddenKey = ''
  private styleEl: HTMLStyleElement | null = null
  private threads: { id: TLShapeId; ends: TLShapeId[] }[] = []

  constructor(readonly editor: Editor) {}

  /* =============================== API =============================== */

  /** Reproduce desde la escena `fromIndex`. `only` = previsualizar solo la transición hacia esa escena. */
  play(fromIndex = 0, opts: { onEnd?: () => void; only?: number } = {}) {
    if (!this.build()) return false
    this.onEnd = opts.onEnd ?? null
    this.ending = false
    this.until = Infinity
    if (opts.only !== undefined) {
      const seg = this.segs[Math.min(opts.only, this.segs.length - 1)]
      // arrancamos 0.3 s antes de la transición para ver de dónde viene
      this.t = Math.max(0, seg.t0 - (seg.index > 0 ? 0.3 : 0))
      this.until = seg.t1 + Math.min(1.2, seg.t2 - seg.t1)
    } else {
      const seg = this.segs[Math.min(fromIndex, this.segs.length - 1)]
      this.t = fromIndex > 0 ? seg.t0 : 0
    }
    this.editor.selectNone()
    this.editor.setCurrentTool('select')
    this.status.set('playing')
    this.render()
    this.lastNow = performance.now()
    cancelAnimationFrame(this.raf)
    this.raf = requestAnimationFrame(this.loop)
    return true
  }

  pause() {
    if (this.status.get() === 'playing') this.status.set('paused')
  }

  resume() {
    if (this.status.get() !== 'paused') return
    this.status.set('playing')
    this.lastNow = performance.now()
    cancelAnimationFrame(this.raf)
    this.raf = requestAnimationFrame(this.loop)
  }

  toggle() {
    const s = this.status.get()
    if (s === 'playing') this.pause()
    else if (s === 'paused') this.resume()
    else this.play(0)
  }

  /** Saltar a un instante (segundos). Funciona en pausa y reproduciendo. */
  seek(t: number) {
    if (this.status.get() === 'idle') return
    this.t = Math.max(0, Math.min(this.total, t))
    this.ending = false
    this.render()
  }

  getTime() {
    return this.t
  }

  next() {
    if (this.status.get() === 'idle') return
    const i = this.segAt(this.t).index + 1
    if (i >= this.segs.length) return this.finish()
    this.seek(this.segs[i].t0)
  }

  prev() {
    if (this.status.get() === 'idle') return
    const seg = this.segAt(this.t)
    const target = this.t - seg.t0 > 0.6 || seg.index === 0 ? seg : this.segs[seg.index - 1]
    this.seek(target.index === 0 ? 0 : target.t0)
  }

  stop(restoreCamera = false) {
    cancelAnimationFrame(this.raf)
    this.ending = false
    this.status.set('idle')
    this.fx.set(ZERO_FX)
    this.applyCanvasStyle('', '')
    this.setAnimCss('')
    this.hiddenKey = ''
    this.hiddenIds.set(new Set())
    if (restoreCamera && this.savedCamera) this.editor.setCamera(this.savedCamera, { animation: { duration: 400 } })
  }

  /* ========================= línea de tiempo ========================= */

  private build() {
    const show = getShow(this.editor)
    const scenes = show.scenes.filter((s) => this.sceneBounds(s))
    if (!scenes.length) return false
    this.show = show
    this.savedCamera = { ...this.editor.getCamera() }
    this.startCam = this.currentCam()

    const segs: Seg[] = []
    let t = 0
    let from = this.startCam
    scenes.forEach((scene, index) => {
      const tr: Transition =
        index === 0
          ? { type: 'smooth', duration: show.effects.introDuration, easing: 'easeInOutCubic', intensity: 0.5 }
          : scene.transitionIn
      const dur = tr.type === 'cut' ? 0 : Math.max(0.05, tr.duration)
      const bounds = this.sceneBounds(scene)!
      const to = this.fit(scene, bounds)
      const t0 = t
      const t1 = t0 + dur
      const t2 = t1 + Math.max(0, scene.hold)
      const attached =
        scene.target.kind === 'shape'
          ? this.editor
              .getBindingsToShape(scene.target.shapeId, ATTACH_TYPE)
              .map((b) => ({ id: b.fromId, isPin: this.editor.getShape(b.fromId)?.type === PIN_TYPE }))
          : []
      const seg: Seg = {
        scene,
        index,
        tr,
        t0,
        t1,
        t2,
        from,
        to,
        bounds,
        spotOn: scene.spotlight === 'inherit' ? show.effects.spotlight.enabled : scene.spotlight === 'on',
        entranceAt: t1 - Math.min(0.35, dur * 0.4),
        attached,
      }
      if (tr.type === 'thread' && index > 0) seg.path = this.threadPath(segs[index - 1], seg, from)
      segs.push(seg)
      from = this.kenBurns(seg, 1)
      t = t2
    })
    this.segs = segs
    this.total = t
    this.threads = this.editor
      .getCurrentPageShapes()
      .filter((sh) => sh.type === THREAD_TYPE)
      .map((sh) => ({
        id: sh.id,
        ends: this.editor.getBindingsFromShape<ThreadBinding>(sh.id, THREAD_BINDING).map((b) => b.toId),
      }))
    this.timeline.set({
      total: t,
      marks: segs.map((s) => ({ t: s.t0, label: s.scene.label, index: s.index })),
    })
    return true
  }

  private segAt(t: number): Seg {
    for (const s of this.segs) if (t < s.t2) return s
    return this.segs[this.segs.length - 1]
  }

  /* ============================== loop =============================== */

  private loop = (now: number) => {
    if (this.status.get() !== 'playing' || this.ending) return
    const dt = Math.min(0.1, (now - this.lastNow) / 1000)
    this.lastNow = now
    this.t += dt
    const end = Math.min(this.total, this.until)
    if (this.t >= end) {
      if (this.until === Infinity && this.show.effects.loop && this.segs.length > 1) {
        this.t = this.segs[0].t1 // vuelve a la escena 1 sin repetir la entrada
      } else {
        this.t = end
        this.render()
        return this.finish()
      }
    }
    this.render()
    this.raf = requestAnimationFrame(this.loop)
  }

  private finish() {
    cancelAnimationFrame(this.raf)
    this.ending = true
    const cb = this.onEnd
    // al grabar dejamos ~1 s de “cola” congelada en la última escena
    setTimeout(() => {
      this.stop()
      cb?.()
    }, this.recording.get() ? 1000 : 0)
  }

  /* ============================ evaluación =========================== */

  private render() {
    const t = this.t
    const seg = this.segAt(t)
    if (this.index.get() !== seg.index) this.index.set(seg.index)
    const vp = this.editor.getViewportScreenBounds()
    const tr = seg.tr
    const fxs = this.show.effects

    let blur = 0
    let whip = { x: 0, y: 0 }
    let fade = 0
    let glitch = 0
    let spot: PageSpot | null

    if (t < seg.t1) {
      // ----------------------------- transición -----------------------------
      const u = clamp01((t - seg.t0) / Math.max(1e-6, seg.t1 - seg.t0))
      const e = EASINGS[tr.easing](u)
      const bell = Math.sin(Math.PI * u)
      const { from, to } = seg
      let spotT = e
      switch (tr.type) {
        case 'cut':
          this.applyCam(to)
          break
        case 'smooth':
          this.applyCam(this.fly(from, to, e, vp))
          break
        case 'gaussian':
          this.applyCam(this.fly(from, to, e, vp))
          blur = tr.intensity * 22 * bell
          break
        case 'whip': {
          this.applyCam(this.fly(from, to, e, vp, 0.3))
          const dx = (to.cx - from.cx) * to.z
          const dy = (to.cy - from.cy) * to.z
          const len = Math.hypot(dx, dy) || 1
          const amt = tr.intensity * 70 * Math.pow(bell, 1.5)
          whip = { x: (Math.abs(dx) / len) * amt, y: (Math.abs(dy) / len) * amt }
          break
        }
        case 'punch': {
          const over = lerp(1, EASINGS.easeOutBack(u), 0.4 + tr.intensity)
          const z = Math.exp(lerp(Math.log(from.z), Math.log(to.z), over))
          this.applyCam({ cx: lerp(from.cx, to.cx, e), cy: lerp(from.cy, to.cy, e), z })
          blur = tr.intensity * 6 * bell
          break
        }
        case 'fade':
          this.applyCam(u < 0.5 ? from : to)
          fade = bell
          spotT = u < 0.5 ? 0 : 1
          break
        case 'thread': {
          if (!seg.path) {
            this.applyCam(this.fly(from, to, e, vp))
            break
          }
          const p = this.pointOnPath(seg.path, e)
          // un poco más cerca del hilo a mitad de camino, como siguiendo la pista
          const z = Math.exp(lerp(Math.log(from.z), Math.log(to.z), e)) * (1 + 0.25 * Math.sin(Math.PI * u))
          this.applyCam({ cx: p.x, cy: p.y, z })
          break
        }
        case 'glitch': {
          const on = bell > 0.15
          const base = u < 0.5 ? from : to
          const r = this.noise(t)
          const j = on ? (tr.intensity * 14) / base.z : 0
          this.applyCam({
            cx: base.cx + (r - 0.5) * j,
            cy: base.cy + (this.noise(t + 0.077) - 0.5) * j * 0.4,
            z: base.z * (1 + (on ? (r - 0.5) * 0.04 * tr.intensity : 0)),
          })
          glitch = tr.intensity * Math.pow(bell, 0.6) * (0.6 + 0.4 * r)
          spotT = u < 0.5 ? 0 : 1
          break
        }
      }
      // linterna: del final de la escena anterior al punto de partida de esta
      const prev = seg.index > 0 ? this.spotEnd(this.segs[seg.index - 1]) : null
      const start = this.spotAt(seg, 0)
      const a = prev ?? { ...start, a: 0 }
      spot = {
        cx: lerp(a.cx, start.cx, spotT),
        cy: lerp(a.cy, start.cy, spotT),
        rx: lerp(a.rx, start.rx, spotT),
        ry: lerp(a.ry, start.ry, spotT),
        a: lerp(a.a, start.a, spotT),
      }
    } else {
      // ------------------------------- pausa -------------------------------
      const u = seg.scene.hold > 0 ? clamp01((t - seg.t1) / seg.scene.hold) : 1
      this.applyCam(this.kenBurns(seg, u))
      spot = this.spotAt(seg, t - seg.t1)
    }

    // ---------- linterna en coordenadas de pantalla ----------
    let spotVp: Fx['spot'] = null
    if (spot && spot.a > 0.005) {
      const c = this.editor.pageToViewport({ x: spot.cx, y: spot.cy })
      const z = this.editor.getZoomLevel()
      let rx = spot.rx * z
      let ry = spot.ry * z
      if (fxs.spotlight.shape === 'circle') rx = ry = Math.max(rx, ry)
      if (fxs.spotlight.flicker) {
        const f = 1 + (this.noise(t * 0.6) - 0.5) * 0.05
        rx *= f
        ry *= f
      }
      spotVp = { x: c.x, y: c.y, rx, ry }
    }

    // ---------- filtros del lienzo ----------
    const filters: string[] = []
    if (GRADE_FILTERS[fxs.grade]) filters.push(GRADE_FILTERS[fxs.grade])
    if (blur > 0.2) filters.push(`blur(${blur.toFixed(2)}px)`)
    if (whip.x + whip.y > 0.5) filters.push('url(#cb-whip)')
    if (glitch > 0.05) filters.push(`hue-rotate(${((this.noise(t * 3) - 0.5) * 120 * glitch).toFixed(0)}deg) saturate(${1 + glitch * 1.5})`)
    this.setWhip(whip.x, whip.y)
    const transform = glitch > 0.05 ? `translate(${((this.noise(t * 5) - 0.5) * 18 * glitch).toFixed(1)}px, 0)` : ''
    this.applyCanvasStyle(filters.join(' '), transform)

    // ---------- entradas y objetos ocultos ----------
    this.renderEntrances(t)

    this.fx.set({
      spot: spotVp,
      spotAlpha: spot?.a ?? 0,
      fade,
      glitch,
      letterbox: clamp01(t / 0.7),
      t,
      total: this.total,
    })
  }

  private renderEntrances(t: number) {
    const reveal = this.show.effects.reveal
    const css: string[] = []
    const firstAt = new Map<TLShapeId, number>()
    for (const seg of this.segs) {
      const ids: TLShapeId[] =
        seg.scene.target.kind === 'shape' ? [seg.scene.target.shapeId, ...seg.attached.map((a) => a.id)] : []
      for (const id of ids) if (!firstAt.has(id)) firstAt.set(id, seg.entranceAt)

      const type = seg.scene.entrance
      if (type === 'none' || seg.scene.target.kind !== 'shape') continue
      const p = (t - seg.entranceAt) / ENTRANCE_DURATION
      if (p <= 0 || p >= 1) continue
      const main = entranceStyle(type, p)
      if (main) css.push(`.tl-shape[data-shape-id="${seg.scene.target.shapeId}"]>*{${styleToCss(main)}}`)
      for (const a of seg.attached) {
        const st = a.isPin ? pinPressStyle(type, p) : entranceStyle(type, p)
        if (st) css.push(`.tl-shape[data-shape-id="${a.id}"]>*{${styleToCss(st)}}`)
      }
    }
    // “Seguir el hilo”: el hilo se desenrolla al ritmo de la cámara
    const unrolling = new Set<TLShapeId>()
    for (const seg of this.segs) {
      if (!seg.path || t < seg.t0 || t >= seg.t1) continue
      const e = EASINGS[seg.tr.easing](clamp01((t - seg.t0) / Math.max(1e-6, seg.t1 - seg.t0)))
      const off = seg.path.backward ? -(1 - e) : 1 - e
      const sel = `.tl-shape[data-shape-id="${seg.path.threadId}"]`
      css.push(`${sel} .cb-thread__main,${sel} .cb-thread__shadow{stroke-dasharray:1!important;stroke-dashoffset:${off.toFixed(4)}!important;animation:none!important}`)
      css.push(`${sel} .cb-thread__twist,${sel} .cb-thread__fuzz{opacity:${(e * e).toFixed(3)}!important;animation:none!important}`)
      unrolling.add(seg.path.threadId)
    }
    this.setAnimCss(css.join('\n'))

    // ocultos: los que todavía no aparecieron
    const hidden = new Set<TLShapeId>()
    if (reveal) {
      for (const [id, at] of firstAt) if (t < at) hidden.add(id)
      // un hilo aparece cuando aparecen sus dos puntas (o mientras se desenrolla)
      for (const th of this.threads) {
        if (unrolling.has(th.id)) continue
        const usedLater = this.segs.some((sg) => sg.path?.threadId === th.id && t < sg.t0)
        if (usedLater || th.ends.some((id) => hidden.has(id))) hidden.add(th.id)
      }
    }
    const key = [...hidden].sort().join(',')
    if (key !== this.hiddenKey) {
      this.hiddenKey = key
      this.hiddenIds.set(hidden)
    }
  }

  /* ============================== helpers ============================== */

  private spotAt(seg: Seg, tau: number): PageSpot {
    const b = seg.bounds
    const st = spotAnimAt(seg.scene.spotAnim, tau)
    const size = this.show.effects.spotlight.size
    return {
      cx: b.center.x + st.x * b.w,
      cy: b.center.y + st.y * b.h,
      rx: (b.w / 2) * size * st.r,
      ry: (b.h / 2) * size * st.r,
      a: (seg.spotOn ? 1 : 0) * st.a,
    }
  }

  private spotEnd(seg: Seg): PageSpot {
    return this.spotAt(seg, seg.t2 - seg.t1)
  }

  private kenBurns(seg: Seg, u: number): Cam {
    const kb = seg.scene.kenBurns
    if (!kb.enabled) return seg.to
    const vp = this.editor.getViewportScreenBounds()
    const e = EASINGS.easeInOutSine(u)
    const z = seg.to.z * (1 + kb.zoom * e)
    const d = (0.035 * vp.w) / z
    const dir = { none: [0, 0], left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[kb.drift]
    return { cx: seg.to.cx + dir[0] * d * e, cy: seg.to.cy + dir[1] * d * e, z }
  }

  /** Busca un hilo rojo que una la escena anterior con esta y arma el recorrido. */
  private threadPath(a: Seg, b: Seg, from: Cam): Seg['path'] {
    const idsOf = (s: Seg) =>
      new Set<TLShapeId>(s.scene.target.kind === 'shape' ? [s.scene.target.shapeId, ...s.attached.map((x) => x.id)] : [])
    const A = idsOf(a)
    const B = idsOf(b)
    for (const shape of this.editor.getCurrentPageShapes()) {
      if (shape.type !== THREAD_TYPE) continue
      const t = shape as ThreadShape
      const bs = this.editor.getBindingsFromShape<ThreadBinding>(t, THREAD_BINDING)
      const start = bs.find((x) => x.props.terminal === 'start')?.toId
      const end = bs.find((x) => x.props.terminal === 'end')?.toId
      if (!start || !end) continue
      const forward = A.has(start) && B.has(end)
      const backward = A.has(end) && B.has(start)
      if (!forward && !backward) continue
      const o = this.editor.getShapePageTransform(t).point()
      let curve = restCurve(t.props.endX, t.props.endY, t.props.slack, 32).map((p) => ({ x: p.x + o.x, y: p.y + o.y }))
      if (backward) curve = curve.reverse()
      const pts = [{ x: from.cx, y: from.cy }, ...curve, { x: b.to.cx, y: b.to.cy }]
      const acc = [0]
      for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
      return { pts, acc, threadId: t.id, backward }
    }
    return undefined
  }

  private pointOnPath(path: NonNullable<Seg['path']>, e: number) {
    const total = path.acc[path.acc.length - 1] || 1
    const d = clamp01(e) * total
    let i = 1
    while (i < path.acc.length - 1 && path.acc[i] < d) i++
    const span = path.acc[i] - path.acc[i - 1] || 1
    const k = (d - path.acc[i - 1]) / span
    const p0 = path.pts[i - 1]
    const p1 = path.pts[i]
    return { x: lerp(p0.x, p1.x, k), y: lerp(p0.y, p1.y, k) }
  }

  private noise(t: number) {
    const x = Math.sin(t * 137.13 + 11.7) * 43758.5453
    return x - Math.floor(x)
  }

  sceneBounds(scene: Scene): Box | null {
    if (scene.target.kind === 'view') {
      const { x, y, w, h } = scene.target
      return new Box(x, y, w, h)
    }
    const shape = this.editor.getShape(scene.target.shapeId)
    if (!shape) return null
    return this.editor.getShapePageBounds(shape) ?? null
  }

  /** Cámara que encuadra la escena dejando lugar para las barras de cine. */
  fit(scene: Scene, b = this.sceneBounds(scene)!): Cam {
    const vp = this.editor.getViewportScreenBounds()
    const fx = (this.show ?? getShow(this.editor)).effects
    const bars = fx.letterbox.enabled ? vp.h * fx.letterbox.height * 2 : 0
    const isFrame =
      scene.target.kind === 'view' ||
      (scene.target.kind === 'shape' && this.editor.getShape(scene.target.shapeId)?.type === CAMFRAME_TYPE)
    const pad = isFrame ? 0 : scene.padding
    const availW = Math.max(50, vp.w - pad * 2)
    const availH = Math.max(50, vp.h - (isFrame ? 0 : bars) - pad * 2)
    const z = Math.min(availW / b.w, availH / b.h, 8)
    return { cx: b.center.x, cy: b.center.y, z: Math.max(0.05, z) }
  }

  private currentCam(): Cam {
    const cam = this.editor.getCamera()
    const vp = this.editor.getViewportScreenBounds()
    return { cx: vp.w / (2 * cam.z) - cam.x, cy: vp.h / (2 * cam.z) - cam.y, z: cam.z }
  }

  private applyCam(c: Cam) {
    const vp = this.editor.getViewportScreenBounds()
    this.editor.setCamera({ x: vp.w / (2 * c.z) - c.cx, y: vp.h / (2 * c.z) - c.cy, z: c.z }, { immediate: true, force: true })
  }

  /** Interpolación tipo “vuelo”: zoom logarítmico + leve alejamiento en saltos largos. */
  private fly(a: Cam, b: Cam, e: number, vp: Box, extraBump = 0): Cam {
    let z = Math.exp(lerp(Math.log(a.z), Math.log(b.z), e))
    const dist = Math.hypot(b.cx - a.cx, b.cy - a.cy) * Math.min(a.z, b.z)
    const ratio = dist / vp.w
    const bump = Math.min(0.6, Math.max(0, (ratio - 0.6) * 0.22) + extraBump * Math.min(1, ratio))
    z *= 1 - bump * Math.sin(Math.PI * e)
    return { cx: lerp(a.cx, b.cx, e), cy: lerp(a.cy, b.cy, e), z }
  }

  private applyCanvasStyle(filter: string, transform: string) {
    const el = this.editor.getContainer().querySelector<HTMLElement>('.tl-canvas')
    if (!el) return
    el.style.filter = filter
    el.style.transform = transform
  }

  private setAnimCss(css: string) {
    if (!this.styleEl) {
      this.styleEl = document.createElement('style')
      this.styleEl.id = 'cb-anim'
      document.head.appendChild(this.styleEl)
    }
    if (this.styleEl.textContent !== css) this.styleEl.textContent = css
  }

  private setWhip(x: number, y: number) {
    document.getElementById('cb-whip-blur')?.setAttribute('stdDeviation', `${x.toFixed(1)} ${y.toFixed(1)}`)
  }
}
