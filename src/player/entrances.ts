/**
 * ENTRADAS DE OBJETOS — “recién lo estás clavando en el corcho”.
 *
 * Funciones puras de progreso p ∈ [0,1] → estilo CSS. El motor genera cada
 * frame una regla CSS por objeto animado:
 *    .tl-shape[data-shape-id="…"] > * { transform: …; opacity: … }
 * Se anima el HIJO del shape (no el shape), así no se pisa la transformación
 * que tldraw usa para posicionarlo.
 */
import type { EntranceType } from '../board/settings'

export const ENTRANCES: Record<EntranceType, { label: string; icon: string; hint: string }> = {
  none: { label: 'Ninguna', icon: '—', hint: 'El objeto ya está' },
  pin: { label: 'Clavar', icon: '📌', hint: 'Se apoya en el corcho y el pin se clava encima' },
  pop: { label: 'Pop', icon: '✦', hint: 'Aparece creciendo con rebote' },
  fade: { label: 'Fundido', icon: '◐', hint: 'Aparece suave' },
  slide: { label: 'Deslizar', icon: '⇡', hint: 'Sube desde abajo' },
  drop: { label: 'Caer', icon: '⤓', hint: 'Cae desde arriba y rebota' },
  flip: { label: 'Girar', icon: '⟲', hint: 'Se da vuelta como una carta' },
}

/** duración en segundos de cada entrada (la del pin incluye el clavado) */
export const ENTRANCE_DURATION = 0.95

export interface EntranceStyle { transform: string; opacity: number; filter?: string; origin?: string }

const c01 = (v: number) => Math.max(0, Math.min(1, v))
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
const easeIn = (t: number) => t * t * t
const back = (t: number) => {
  const c1 = 1.9, c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}
function bounce(t: number) {
  const n = 7.5625, d = 2.75
  if (t < 1 / d) return n * t * t
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375
  return n * (t -= 2.625 / d) * t + 0.984375
}

/** Estilo del objeto principal de la escena. */
export function entranceStyle(type: EntranceType, p: number): EntranceStyle | null {
  if (type === 'none' || p >= 1) return null
  p = c01(p)
  switch (type) {
    case 'pin': {
      // 0 → 0.5: baja “en el aire” (más grande, sombra amplia)  ·  0.5 → 0.62: golpe  ·  resto: asienta
      if (p < 0.5) {
        const q = easeIn(p / 0.5)
        const lift = 1 - q
        return {
          transform: `translate(${(-8 * lift).toFixed(1)}px, ${(-46 * lift).toFixed(1)}px) rotate(${(-5 * lift).toFixed(2)}deg) scale(${(1 + 0.1 * lift).toFixed(3)})`,
          opacity: c01(p / 0.18),
          filter: `drop-shadow(${(14 * lift + 2).toFixed(1)}px ${(26 * lift + 3).toFixed(1)}px ${(22 * lift + 4).toFixed(1)}px rgba(0,0,0,${(0.35 + 0.15 * lift).toFixed(2)}))`,
          origin: '50% 0%',
        }
      }
      const q = c01((p - 0.5) / 0.5)
      const squash = Math.sin(q * Math.PI * 2.5) * Math.exp(-q * 5) * 0.025
      return { transform: `scale(${(1 + squash).toFixed(4)}, ${(1 - squash).toFixed(4)})`, opacity: 1, origin: '50% 0%' }
    }
    case 'pop': {
      const s = 0.4 + 0.6 * back(c01(p / 0.8))
      return { transform: `scale(${s.toFixed(3)})`, opacity: c01(p / 0.3), origin: '50% 50%' }
    }
    case 'fade':
      return { transform: `scale(${(0.97 + 0.03 * easeOut(p)).toFixed(3)})`, opacity: easeOut(p), origin: '50% 50%' }
    case 'slide':
      return { transform: `translateY(${(60 * (1 - easeOut(p))).toFixed(1)}px)`, opacity: c01(p / 0.4) }
    case 'drop':
      return { transform: `translateY(${(-260 * (1 - bounce(p))).toFixed(1)}px)`, opacity: c01(p / 0.15) }
    case 'flip':
      return {
        transform: `perspective(900px) rotateY(${(90 * (1 - easeOut(p))).toFixed(1)}deg)`,
        opacity: c01(p / 0.2),
        origin: '50% 50%',
      }
  }
  return null
}

/** Estilo de los pines anclados al objeto: se clavan después de que el objeto se apoya. */
export function pinPressStyle(type: EntranceType, p: number): EntranceStyle | null {
  if (type === 'none' || p >= 1) return null
  const start = type === 'pin' ? 0.5 : 0.6
  if (p < start) return { transform: 'translateY(-30px) scale(1.7)', opacity: 0 }
  const q = c01((p - start) / (1 - start))
  const fall = easeIn(c01(q / 0.55))
  const s = 1.7 - 0.75 * fall // baja hasta 0.95 (presión)…
  const settle = q > 0.55 ? 0.95 + 0.05 * easeOut((q - 0.55) / 0.45) : s
  return {
    transform: `translateY(${(-30 * (1 - fall)).toFixed(1)}px) scale(${settle.toFixed(3)})`,
    opacity: c01(q / 0.2),
    origin: '50% 50%',
  }
}

export function styleToCss(st: EntranceStyle) {
  return `transform:${st.transform}!important;opacity:${st.opacity}!important;${st.filter ? `filter:${st.filter}!important;` : ''}${st.origin ? `transform-origin:${st.origin}!important;` : ''}`
}
