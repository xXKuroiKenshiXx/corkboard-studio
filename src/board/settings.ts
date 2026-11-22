/**
 * Ajustes del tablero + datos del Modo Reproducción.
 *
 * Todo se guarda dentro de `document.meta` del store de tldraw. Ventajas:
 *  - se persiste solo (IndexedDB vía `persistenceKey`)
 *  - viaja dentro del JSON exportado
 *  - entra en el historial (Ctrl+Z también deshace cambios de escenas / fondo)
 */
import { Editor, TLShapeId, uniqueId } from 'tldraw'

/* ------------------------------------------------------------------ */
/* Fondo                                                               */
/* ------------------------------------------------------------------ */

export type BackgroundKind = 'cork' | 'paper' | 'chalk' | 'felt' | 'grid' | 'dots' | 'solid' | 'image'

export interface BackgroundSettings {
  kind: BackgroundKind
  /** Color base (hex). En corcho define el tono: cálido, rojizo, neutro... */
  color: string
  /** Escala de la textura (1 = normal) */
  scale: number
  /** Oscurecido de bordes en pantalla (0..1) */
  vignette: number
  /** dataURL o URL de imagen propia (kind === 'image') */
  imageUrl?: string
  /** 'world' = la imagen se mueve con la cámara; 'screen' = fija detrás */
  imageMode?: 'world' | 'screen'
}

export const BACKGROUND_PRESETS: { id: string; label: string; bg: Partial<BackgroundSettings> }[] = [
  { id: 'cork-warm', label: 'Corcho cálido', bg: { kind: 'cork', color: '#b8834f' } },
  { id: 'cork-red', label: 'Corcho rojizo', bg: { kind: 'cork', color: '#a5603f' } },
  { id: 'cork-neutral', label: 'Corcho neutro', bg: { kind: 'cork', color: '#b39b78' } },
  { id: 'cork-dark', label: 'Corcho oscuro', bg: { kind: 'cork', color: '#6e4a2c' } },
  { id: 'felt', label: 'Fieltro verde', bg: { kind: 'felt', color: '#2f5a43' } },
  { id: 'chalk', label: 'Pizarra', bg: { kind: 'chalk', color: '#2b3530' } },
  { id: 'paper', label: 'Papel', bg: { kind: 'paper', color: '#efe6d2' } },
  { id: 'grid', label: 'Cuadrícula', bg: { kind: 'grid', color: '#f4f1ea' } },
  { id: 'dots', label: 'Puntos', bg: { kind: 'dots', color: '#1d1f24' } },
  { id: 'solid', label: 'Color liso', bg: { kind: 'solid', color: '#20232a' } },
]

/* ------------------------------------------------------------------ */
/* Ajustes generales                                                   */
/* ------------------------------------------------------------------ */

export interface BoardSettings {
  background: BackgroundSettings
  /** Anclar automáticamente highlights / trazos / textos / pines al objeto de abajo */
  autoAttach: boolean
  /** Convertir en Polaroid las imágenes pegadas */
  autoPolaroid: boolean
  /** La rueda del mouse hace zoom (tablero) o paneo (documento) */
  wheel: 'zoom' | 'pan'
  /** Factor por paso de zoom (1.2 = 20 %) */
  zoomStep: number
}

export const DEFAULT_BOARD: BoardSettings = {
  background: { kind: 'cork', color: '#b8834f', scale: 1, vignette: 0.35, imageMode: 'world' },
  autoAttach: true,
  autoPolaroid: true,
  wheel: 'zoom',
  zoomStep: 1.2,
}

/* ------------------------------------------------------------------ */
/* Modo Reproducción                                                   */
/* ------------------------------------------------------------------ */

export type TransitionType = 'smooth' | 'cut' | 'gaussian' | 'fade' | 'glitch' | 'whip' | 'punch' | 'thread'
export type EasingName =
  | 'linear'
  | 'easeInOutSine'
  | 'easeInOutCubic'
  | 'easeInOutQuint'
  | 'easeOutExpo'
  | 'easeOutBack'
  | 'anticipate'

export interface Transition {
  type: TransitionType
  /** segundos */
  duration: number
  easing: EasingName
  /** 0..1: fuerza del efecto (desenfoque, glitch, barrido...) */
  intensity: number
}

export type SceneTarget =
  | { kind: 'shape'; shapeId: TLShapeId }
  | { kind: 'view'; x: number; y: number; w: number; h: number }

/** Cómo llega la linterna al objeto de la escena */
export type SpotAnimType = 'none' | 'search' | 'sweep' | 'drop' | 'flicker' | 'scan' | 'orbit' | 'custom'

export interface SpotAnim {
  type: SpotAnimType
  /** segundos que dura la animación (arranca cuando la cámara llega) */
  duration: number
  /** semilla para que el recorrido “errático” sea siempre el mismo */
  seed: number
  /** recorrido grabado a mano: [t (s), x, y] relativo al centro del objeto, en unidades de su tamaño */
  path?: [number, number, number][]
}

/** Cómo aparece el objeto de la escena */
export type EntranceType = 'none' | 'pin' | 'pop' | 'fade' | 'slide' | 'drop' | 'flip'

export interface Scene {
  id: string
  label: string
  target: SceneTarget
  /** segundos que la cámara se queda en la escena */
  hold: number
  /** margen alrededor del objetivo (px de pantalla) */
  padding: number
  kenBurns: { enabled: boolean; zoom: number; drift: 'none' | 'left' | 'right' | 'up' | 'down' }
  spotlight: 'inherit' | 'on' | 'off'
  /** Transición que lleva HASTA esta escena (el “nodo” entre tarjetas) */
  transitionIn: Transition
  spotAnim: SpotAnim
  entrance: EntranceType
}

export type ColorGrade = 'none' | 'noir' | 'sepia' | 'warm' | 'cold' | 'vivid'

export interface ShowEffects {
  letterbox: { enabled: boolean; height: number; opacity: number }
  spotlight: {
    enabled: boolean
    /** tamaño del haz relativo al objeto (1 = justo) */
    size: number
    /** 0..1 suavidad del borde */
    softness: number
    /** 0..1 oscuridad del entorno */
    dim: number
    flicker: boolean
    warm: boolean
    shape: 'ellipse' | 'circle'
  }
  vignette: { enabled: boolean; amount: number }
  grain: { enabled: boolean; amount: number }
  grade: ColorGrade
  hud: { autoHide: boolean }
  loop: boolean
  /** Ocultar los objetos de cada escena hasta que les toca aparecer */
  reveal: boolean
  /** Duración de la transición inicial desde la vista actual hasta la escena 1 */
  introDuration: number
}

export interface ShowData {
  scenes: Scene[]
  effects: ShowEffects
  preset: string
}

export const DEFAULT_TRANSITION: Transition = {
  type: 'smooth',
  duration: 1.4,
  easing: 'easeInOutCubic',
  intensity: 0.6,
}

export const DEFAULT_EFFECTS: ShowEffects = {
  letterbox: { enabled: true, height: 0.09, opacity: 1 },
  spotlight: { enabled: false, size: 1.35, softness: 0.45, dim: 0.72, flicker: false, warm: true, shape: 'ellipse' },
  vignette: { enabled: true, amount: 0.45 },
  grain: { enabled: false, amount: 0.12 },
  grade: 'none',
  hud: { autoHide: true },
  loop: false,
  reveal: false,
  introDuration: 1.2,
}

export interface ShowPreset {
  id: string
  label: string
  description: string
  effects: ShowEffects
  transition: Transition
  spot: SpotAnimType
  entrance: EntranceType
}

export const SHOW_PRESETS: ShowPreset[] = [
  {
    id: 'detective-noir',
    label: 'Detective Noir',
    description: 'Linterna, barras de cine, grano y glitches entre pistas.',
    effects: {
      ...DEFAULT_EFFECTS,
      letterbox: { enabled: true, height: 0.11, opacity: 1 },
      spotlight: { enabled: true, size: 1.3, softness: 0.5, dim: 0.82, flicker: true, warm: true, shape: 'ellipse' },
      vignette: { enabled: true, amount: 0.6 },
      grain: { enabled: true, amount: 0.18 },
      grade: 'noir',
    },
    transition: { type: 'glitch', duration: 0.9, easing: 'easeInOutQuint', intensity: 0.7 },
    spot: 'search',
    entrance: 'none',
  },
  {
    id: 'youtube-explainer',
    label: 'YouTube Explainer',
    description: 'Limpio, zoom suave tipo Ken Burns, sin barras.',
    effects: {
      ...DEFAULT_EFFECTS,
      letterbox: { enabled: false, height: 0.08, opacity: 1 },
      spotlight: { ...DEFAULT_EFFECTS.spotlight, enabled: false },
      vignette: { enabled: true, amount: 0.25 },
      grain: { enabled: false, amount: 0.1 },
      grade: 'vivid',
    },
    transition: { type: 'smooth', duration: 1.3, easing: 'easeInOutCubic', intensity: 0.5 },
    spot: 'none',
    entrance: 'pop',
  },
  {
    id: 'polaroid-story',
    label: 'Polaroid Story',
    description: 'Tono cálido sepia, fundidos y desenfoque gaussiano.',
    effects: {
      ...DEFAULT_EFFECTS,
      letterbox: { enabled: true, height: 0.07, opacity: 0.9 },
      spotlight: { enabled: true, size: 1.6, softness: 0.8, dim: 0.45, flicker: false, warm: true, shape: 'ellipse' },
      vignette: { enabled: true, amount: 0.5 },
      grain: { enabled: true, amount: 0.1 },
      grade: 'sepia',
      reveal: true,
    },
    transition: { type: 'gaussian', duration: 1.6, easing: 'easeInOutSine', intensity: 0.6 },
    spot: 'drop',
    entrance: 'pin',
  },
  {
    id: 'trailer',
    label: 'Tráiler',
    description: 'Barridos rápidos y golpes de zoom con mucho contraste.',
    effects: {
      ...DEFAULT_EFFECTS,
      letterbox: { enabled: true, height: 0.12, opacity: 1 },
      spotlight: { ...DEFAULT_EFFECTS.spotlight, enabled: false },
      vignette: { enabled: true, amount: 0.55 },
      grain: { enabled: true, amount: 0.08 },
      grade: 'cold',
    },
    transition: { type: 'whip', duration: 0.7, easing: 'easeInOutQuint', intensity: 0.8 },
    spot: 'sweep',
    entrance: 'drop',
  },
]

export const DEFAULT_SHOW: ShowData = { scenes: [], effects: DEFAULT_EFFECTS, preset: 'custom' }

export function makeScene(target: SceneTarget, label: string, transition: Transition = DEFAULT_TRANSITION): Scene {
  return {
    id: uniqueId(),
    label,
    target,
    hold: 2.5,
    padding: 80,
    kenBurns: { enabled: true, zoom: 0.06, drift: 'none' },
    spotlight: 'inherit',
    transitionIn: { ...transition },
    spotAnim: { type: 'none', duration: 2, seed: Math.floor(Math.random() * 1e6) },
    entrance: 'none',
  }
}

/** Completa escenas guardadas con versiones anteriores. */
export function normalizeScene(s: Partial<Scene>): Scene {
  return {
    ...makeScene(s.target ?? { kind: 'view', x: 0, y: 0, w: 100, h: 100 }, s.label ?? 'Escena'),
    ...s,
    spotAnim: { type: 'none', duration: 2, seed: 1, ...(s.spotAnim ?? {}) },
    entrance: s.entrance ?? 'none',
  } as Scene
}

/* ------------------------------------------------------------------ */
/* Lectura / escritura en document.meta                                */
/* ------------------------------------------------------------------ */

function deepMerge<T>(base: T, patch: any): T {
  if (patch === undefined || patch === null) return base
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return patch as T
  const out: any = { ...base }
  for (const k of Object.keys(patch)) out[k] = deepMerge((base as any)[k], patch[k])
  return out
}

export function getBoard(editor: Editor): BoardSettings {
  return deepMerge(DEFAULT_BOARD, (editor.getDocumentSettings().meta as any)?.board)
}

export function getShow(editor: Editor): ShowData {
  const raw = (editor.getDocumentSettings().meta as any)?.show
  const show = deepMerge(DEFAULT_SHOW, raw)
  show.scenes = ((raw?.scenes ?? []) as Partial<Scene>[]).map(normalizeScene)
  return show
}

export function setBoard(editor: Editor, patch: Partial<BoardSettings> | ((b: BoardSettings) => BoardSettings)) {
  const current = getBoard(editor)
  const next = typeof patch === 'function' ? patch(current) : { ...current, ...patch }
  const meta = editor.getDocumentSettings().meta as any
  editor.updateDocumentSettings({ meta: { ...meta, board: JSON.parse(JSON.stringify(next)) } })
}

export function setShow(editor: Editor, patch: Partial<ShowData> | ((s: ShowData) => ShowData)) {
  const current = getShow(editor)
  const next = typeof patch === 'function' ? patch(current) : { ...current, ...patch }
  const meta = editor.getDocumentSettings().meta as any
  editor.updateDocumentSettings({ meta: { ...meta, show: JSON.parse(JSON.stringify(next)) } })
}
