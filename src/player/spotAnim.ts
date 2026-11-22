/**
 * ANIMACIONES DE LA LINTERNA DE DETECTIVE
 *
 * Cada animación es una función pura del tiempo:
 *     spotAnimAt(anim, τ) → { x, y, r, a }
 *   x, y : desplazamiento desde el centro del objeto, en unidades de su tamaño
 *          (x = 1 → un ancho del objeto a la derecha)
 *   r    : escala del radio del haz (1 = cubre el objeto)
 *   a    : multiplicador de intensidad (0 = apagada)
 *
 * Al ser funciones puras, la barra de tiempo puede adelantar/retroceder
 * y siempre se ve exactamente lo mismo (también al grabar).
 */
import type { SpotAnim, SpotAnimType } from '../board/settings'

export interface SpotState { x: number; y: number; r: number; a: number }

export const SPOT_ANIMS: Record<SpotAnimType, { label: string; icon: string; hint: string }> = {
  none: { label: 'Directa', icon: '◎', hint: 'La luz acompaña a la cámara' },
  search: { label: 'Búsqueda', icon: '〽', hint: 'Entra desde arriba y busca errática hasta encontrar el objeto' },
  sweep: { label: 'Barrido', icon: '⇄', hint: 'Barre de lado a lado y se frena en el objeto' },
  drop: { label: 'Cae', icon: '⤓', hint: 'Cae desde arriba con rebote' },
  flicker: { label: 'Parpadeo', icon: '✷', hint: 'Se enciende como una lamparita que falla' },
  scan: { label: 'Lectura', icon: '☰', hint: 'Un haz chico “lee” el objeto renglón por renglón y se abre' },
  orbit: { label: 'Espiral', icon: '◌', hint: 'Gira alrededor y se cierra en espiral' },
  custom: { label: 'A mano', icon: '✍', hint: 'Grabá vos el recorrido moviendo el mouse' },
}

/* ------------------------------ utilidades ------------------------------ */

function rng(seed: number) {
  let s = (seed >>> 0) || 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
function bounce(t: number) {
  const n = 7.5625, d = 2.75
  if (t < 1 / d) return n * t * t
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375
  return n * (t -= 2.625 / d) * t + 0.984375
}

/** Catmull-Rom por una lista de puntos, t ∈ [0,1] */
function spline(pts: [number, number][], t: number): [number, number] {
  const n = pts.length - 1
  const f = clamp01(t) * n
  const i = Math.min(n - 1, Math.floor(f))
  const u = f - i
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)]
  const c = (a: number, b: number, c2: number, d: number) =>
    0.5 * (2 * b + (-a + c2) * u + (2 * a - 5 * b + 4 * c2 - d) * u * u + (-a + 3 * b - 3 * c2 + d) * u * u * u)
  return [c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]
}

/** temblor de mano: ruido suave determinista */
function shake(seed: number, t: number, amp: number) {
  const a = Math.sin(t * 7.1 + seed) * 0.6 + Math.sin(t * 13.7 + seed * 1.7) * 0.4
  const b = Math.cos(t * 6.3 + seed * 0.7) * 0.6 + Math.sin(t * 11.3 + seed * 2.3) * 0.4
  return [a * amp, b * amp]
}

const cache = new Map<string, [number, number][]>()
function waypoints(kind: string, seed: number): [number, number][] {
  const key = `${kind}:${seed}`
  const hit = cache.get(key)
  if (hit) return hit
  const r = rng(seed)
  const s = (k: number) => (r() * 2 - 1) * k
  let pts: [number, number][] = []
  if (kind === 'search') {
    pts = [
      [s(0.5), -2.4], // arriba, fuera de cuadro
      [s(1.2), -1.1 + s(0.3)],
      [s(1.1), s(0.7)],
      [s(0.8), 0.6 + s(0.3)],
      [s(0.4), s(0.35)],
      [s(0.12), s(0.1)],
      [0, 0],
    ]
  } else if (kind === 'sweep') {
    pts = [[-2.6, -0.25 + s(0.1)], [1.7, 0.15 + s(0.1)], [-0.6, -0.05], [0.15, 0.02], [0, 0]]
  } else if (kind === 'scan') {
    pts = [[-0.38, -0.32], [0.38, -0.3], [-0.38, 0], [0.38, 0.02], [-0.38, 0.3], [0.38, 0.32], [0, 0]]
  }
  cache.set(key, pts)
  return pts
}

/* ------------------------------ animaciones ------------------------------ */

export function spotAnimAt(anim: SpotAnim | undefined, tau: number): SpotState {
  const done: SpotState = { x: 0, y: 0, r: 1, a: 1 }
  if (!anim || anim.type === 'none') return done
  const D = Math.max(0.2, anim.duration)
  const p = clamp01(tau / D)
  if (p >= 1) return done
  const seed = anim.seed || 1

  switch (anim.type) {
    case 'search': {
      const [x, y] = spline(waypoints('search', seed), easeInOut(p) * 0.92 + p * 0.08)
      const [jx, jy] = shake(seed, tau, 0.05 * (1 - p))
      return { x: x + jx, y: y + jy, r: lerp(0.45, 1, easeInOut(clamp01((p - 0.6) / 0.4))), a: 1 }
    }
    case 'sweep': {
      const [x, y] = spline(waypoints('sweep', seed), easeInOut(p))
      return { x, y, r: lerp(0.6, 1, clamp01((p - 0.55) / 0.45)), a: 1 }
    }
    case 'drop': {
      const y = lerp(-2.6, 0, bounce(p))
      return { x: 0, y, r: lerp(0.75, 1, p), a: 1 }
    }
    case 'flicker': {
      // patrón de lamparita: apagado / destellos / encendido
      const r = rng(seed + Math.floor(tau * 22))
      const base = p < 0.15 ? 0 : p < 0.75 ? (r() > 0.45 ? 1 : 0.08) : r() > 0.12 ? 1 : 0.4
      return { x: 0, y: 0, r: 1, a: lerp(base, 1, clamp01((p - 0.85) / 0.15)) }
    }
    case 'scan': {
      const [x, y] = spline(waypoints('scan', seed), clamp01(p / 0.82))
      const open = clamp01((p - 0.78) / 0.22)
      return { x: x * (1 - open), y: y * (1 - open), r: lerp(0.3, 1, easeOut(open)), a: 1 }
    }
    case 'orbit': {
      const turns = 1.6
      const ang = -Math.PI / 2 + easeOut(p) * turns * Math.PI * 2
      const rad = 1.3 * (1 - easeOut(p))
      return { x: Math.cos(ang) * rad, y: Math.sin(ang) * rad * 0.8, r: lerp(0.55, 1, easeOut(clamp01((p - 0.5) / 0.5))), a: 1 }
    }
    case 'custom': {
      const path = anim.path
      if (!path || path.length < 2) return done
      // el recorrido ocupa el 85 % del tiempo; el resto se acomoda al centro
      const total = path[path.length - 1][0] || 1
      const q = clamp01(p / 0.85)
      const tt = q * total
      let i = 1
      while (i < path.length - 1 && path[i][0] < tt) i++
      const [t0, x0, y0] = path[i - 1]
      const [t1, x1, y1] = path[i]
      const u = t1 > t0 ? clamp01((tt - t0) / (t1 - t0)) : 1
      const x = lerp(x0, x1, u)
      const y = lerp(y0, y1, u)
      const settle = easeInOut(clamp01((p - 0.85) / 0.15))
      return { x: x * (1 - settle), y: y * (1 - settle), r: lerp(0.55, 1, settle), a: 1 }
    }
  }
  return done
}
