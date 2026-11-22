/**
 * ¿Animar la aparición de un objeto?
 * No al cargar la página (si no, todo el tablero “caería” de golpe) ni durante
 * la reproducción (ahí mandan las entradas del modo escena).
 */
const APP_START = performance.now()

export function canAnimateMount() {
  if (performance.now() - APP_START < 1500) return false
  return !document.querySelector('.cb-stage.is-playing')
}

export function isPlaying() {
  return !!document.querySelector('.cb-stage.is-playing')
}

/** Tipos que hacen la animación de “apoyar en el corcho” al crearlos. */
export const PLACE_TYPES = new Set(['note', 'polaroid', 'image', 'video', 'text', 'bookmark', 'embed'])

let styleEl: HTMLStyleElement | null = null
const active = new Map<string, string>()

/** Anima el objeto recién creado: baja apenas, se apoya y asienta la sombra. */
export function playPlaceAnimation(id: string) {
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = 'cb-place'
    document.head.appendChild(styleEl)
  }
  active.set(id, `.tl-shape[data-shape-id="${id}"]>*{animation:cb-place .6s cubic-bezier(.2,.8,.3,1.05) both}`)
  styleEl.textContent = [...active.values()].join('\n')
  setTimeout(() => {
    active.delete(id)
    if (styleEl) styleEl.textContent = [...active.values()].join('\n')
  }, 700)
}
