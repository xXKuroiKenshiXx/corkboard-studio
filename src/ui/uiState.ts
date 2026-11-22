import { Editor, TLShape, TLShapeId, atom, createShapeId, react } from 'tldraw'
import { CAMFRAME_TYPE, CameraFrameShape } from '../shapes/CameraFrameShape'
import { Scene, getShow, makeScene, setShow } from '../board/settings'
import { Player } from '../player/Player'
import { Recording, TabRecorder } from '../player/recorder'
import { getAttachBinding } from '../bindings/AttachBinding'

/** Estado de la interfaz (no se guarda en el documento). */
export const ui = {
  scenesOpen: atom('ui.scenesOpen', false),
  menu: atom<'none' | 'background' | 'help' | 'settings'>('ui.menu', 'none'),
  pickMode: atom('ui.pickMode', false),
  flashlight: atom('ui.flashlight', false),
  countdown: atom('ui.countdown', 0),
  recording: atom<Recording | null>('ui.recordingResult', null),
  openTransition: atom<string | null>('ui.openTransition', null),
  openScene: atom<string | null>('ui.openScene', null),
  /** id de la escena cuyo recorrido de linterna se está grabando */
  spotRecording: atom<string | null>('ui.spotRecording', null),
}

export const playerAtom = atom<Player | null>('player', null)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/* ------------------------------------------------------------------ */
/* Escenas                                                             */
/* ------------------------------------------------------------------ */

const TYPE_NAMES: Record<string, string> = {
  note: 'Nota', image: 'Imagen', polaroid: 'Polaroid', geo: 'Forma', text: 'Texto', frame: 'Marco',
  video: 'Video', embed: 'Embed', bookmark: 'Enlace', group: 'Grupo', draw: 'Dibujo', highlight: 'Resaltado',
  pin: 'Pin', arrow: 'Hilo', camframe: 'Vista', thread: 'Hilo',
}

export function labelFor(editor: Editor, shape: TLShape) {
  const text = editor.getShapeUtil(shape).getText(shape)?.trim()
  if (text) return text.length > 34 ? text.slice(0, 32) + '…' : text
  return TYPE_NAMES[shape.type] ?? shape.type
}

/** Si clickeás un pin/highlight anclado, la escena apunta al objeto que lo sostiene. */
function resolveSceneShape(editor: Editor, shape: TLShape): TLShape {
  const b = getAttachBinding(editor, shape.id)
  if (b) return editor.getShape(b.toId) ?? shape
  return shape
}

export function addShapesAsScenes(editor: Editor, shapes: TLShape[]) {
  const show = getShow(editor)
  const last = show.scenes[show.scenes.length - 1]
  const tr = last?.transitionIn ?? undefined
  const added: Scene[] = shapes
    .map((s) => resolveSceneShape(editor, s))
    .filter((s, i, arr) => arr.findIndex((o) => o.id === s.id) === i)
    .map((s) => makeScene({ kind: 'shape', shapeId: s.id }, labelFor(editor, s), tr))
  if (!added.length) return
  editor.markHistoryStoppingPoint('add scenes')
  setShow(editor, (sh) => ({ ...sh, scenes: [...sh.scenes, ...added] }))
}

/**
 * “＋ Vista actual”: crea un MARCO DE CÁMARA (16:9) con lo que se ve ahora
 * y lo agrega como escena. El marco se puede mover y redimensionar después.
 */
export function addCurrentViewAsScene(editor: Editor) {
  const vp = editor.getViewportPageBounds()
  const ratio = 16 / 9
  let w = vp.w * 0.9
  let h = w / ratio
  if (h > vp.h * 0.9) {
    h = vp.h * 0.9
    w = h * ratio
  }
  const id = createShapeId()
  editor.markHistoryStoppingPoint('add view scene')
  editor.createShape<CameraFrameShape>({
    id,
    type: CAMFRAME_TYPE,
    x: vp.center.x - w / 2,
    y: vp.center.y - h / 2,
    props: { w, h, aspect: '16:9' },
  })
  addFrameScene(editor, id)
}

export function addFrameScene(editor: Editor, id: TLShapeId) {
  const show = getShow(editor)
  const tr = show.scenes[show.scenes.length - 1]?.transitionIn
  setShow(editor, (sh) => ({
    ...sh,
    scenes: [...sh.scenes, makeScene({ kind: 'shape', shapeId: id }, `Vista ${sh.scenes.length + 1}`, tr)],
  }))
  ui.scenesOpen.set(true)
}

export function updateScene(editor: Editor, id: string, patch: Partial<Scene> | ((s: Scene) => Scene)) {
  setShow(editor, (sh) => ({
    ...sh,
    preset: sh.preset,
    scenes: sh.scenes.map((s) => (s.id === id ? (typeof patch === 'function' ? patch(s) : { ...s, ...patch }) : s)),
  }))
}

export function removeScene(editor: Editor, id: string) {
  setShow(editor, (sh) => ({ ...sh, scenes: sh.scenes.filter((s) => s.id !== id) }))
}

export function moveScene(editor: Editor, from: number, to: number) {
  setShow(editor, (sh) => {
    const scenes = [...sh.scenes]
    const [it] = scenes.splice(from, 1)
    scenes.splice(Math.max(0, Math.min(scenes.length, to)), 0, it)
    return { ...sh, scenes }
  })
}

/** Modo “elegir en el tablero”: cada clic sobre un objeto lo agrega como escena. */
export function registerPickMode(editor: Editor) {
  const onEvent = (info: any) => {
    if (!ui.pickMode.get()) return
    if (info.type === 'pointer' && info.name === 'pointer_down' && info.target === 'shape' && info.shape) {
      addShapesAsScenes(editor, [info.shape])
    }
    if (info.type === 'keyboard' && info.key === 'Escape') ui.pickMode.set(false)
  }
  // marco dibujado con la herramienta C → se agrega como escena
  const onFrame = (id: TLShapeId) => editor.getShape(id) && addFrameScene(editor, id)
  editor.on('event', onEvent)
  editor.on('cb:camframe-created' as any, onFrame as any)
  return () => {
    editor.off('event', onEvent)
    editor.off('cb:camframe-created' as any, onFrame as any)
  }
}

/* ------------------------------------------------------------------ */
/* Reproducir / grabar                                                 */
/* ------------------------------------------------------------------ */

export function playShow(editor: Editor, from = 0) {
  const p = playerAtom.get()
  if (!p) return
  ui.pickMode.set(false)
  if (!p.play(from)) {
    editor.timers.setTimeout(() => alert('Agregá al menos una escena (panel 🎬 Escenas) para reproducir.'), 0)
  }
}

export async function recordShow(editor: Editor, stage: HTMLElement) {
  const player = playerAtom.get()
  if (!player) return
  if (getShow(editor).scenes.length === 0) {
    alert('Agregá al menos una escena antes de grabar.')
    return
  }
  if (!TabRecorder.isSupported()) {
    alert('Tu navegador no permite grabar la pestaña. Usá Chrome o Edge actualizados.')
    return
  }
  const rec = new TabRecorder()
  try {
    await rec.prepare(stage)
  } catch {
    return // el usuario canceló el permiso
  }
  ui.pickMode.set(false)
  player.recording.set(true)
  for (let n = 3; n > 0; n--) {
    ui.countdown.set(n)
    await sleep(750)
  }
  ui.countdown.set(0)
  await sleep(150)

  let ended = false
  let off = () => {}
  const end = async () => {
    if (ended) return
    ended = true
    off()
    if (player.status.get() !== 'idle') player.stop()
    const result = await rec.stop()
    player.recording.set(false)
    if (result && result.blob.size > 0) ui.recording.set(result)
  }
  rec.onEnded(end)
  rec.start()
  if (!player.play(0)) return end()
  off = react('record-watch', () => {
    if (player.status.get() === 'idle') end()
  })
}
