/**
 * BINDING “attach” — resuelve dos bugs del tablero original:
 *   1) el highlight que se queda quieto cuando movés la nota
 *   2) el pin que no acompaña a la nota/imagen
 *
 * Idea: el binding guarda la posición del origen del objeto anclado
 * (pin, highlight, trazo, texto) en coordenadas LOCALES y NORMALIZADAS (0..1)
 * del objeto destino, más la rotación relativa. Cada vez que el destino cambia
 * (mover, rotar, redimensionar), tldraw llama a `onAfterChangeToShape` y
 * re-proyectamos el anclado con la transformación de página del destino.
 *   → mover/rotar: transformación rígida
 *   → redimensionar: el ancla normalizada mantiene la posición relativa y
 *     además escalamos el anclado (excepto pines, que conservan su tamaño).
 *
 * El anclaje se crea/actualiza/rompe automáticamente al soltar el mouse
 * (ver `registerAutoAttach`).
 */
import {
  BindingOnShapeChangeOptions,
  BindingOnShapeDeleteOptions,
  BindingUtil,
  Editor,
  Mat,
  RecordProps,
  T,
  TLBinding,
  TLShape,
  TLShapeId,
} from 'tldraw'
import { getBoard } from '../board/settings'
import { PIN_TYPE } from '../shapes/PinShape'

export const ATTACH_TYPE = 'attach' as const

declare module '@tldraw/tlschema' {
  export interface TLGlobalBindingPropsMap {
    [ATTACH_TYPE]: {
      /** origen del anclado en coords locales normalizadas del destino */
      ax: number
      ay: number
      /** rotación relativa (rad) */
      rot: number
      /** tamaño del destino al momento de anclar (para detectar resize) */
      tw: number
      th: number
    }
  }
}

export type AttachBinding = TLBinding<typeof ATTACH_TYPE>

/** Tipos que se pueden anclar sobre otro objeto. */
export const ATTACHABLE_TYPES = new Set<string>([PIN_TYPE, 'highlight', 'draw', 'text'])
/** Tipos que nunca son destino. */
const NEVER_TARGET = new Set<string>([...ATTACHABLE_TYPES, 'arrow', 'line', 'group', 'frame', 'camframe', 'thread'])

export class AttachBindingUtil extends BindingUtil<AttachBinding> {
  static override type = ATTACH_TYPE
  static override props: RecordProps<AttachBinding> = {
    ax: T.number,
    ay: T.number,
    rot: T.number,
    tw: T.number,
    th: T.number,
  }

  override getDefaultProps() {
    return { ax: 0, ay: 0, rot: 0, tw: 1, th: 1 }
  }

  /** El destino cambió → re-proyectar el objeto anclado. */
  override onAfterChangeToShape({ binding, shapeAfter }: BindingOnShapeChangeOptions<AttachBinding>) {
    const editor = this.editor
    const attached = editor.getShape(binding.fromId)
    if (!attached) return
    const bounds = editor.getShapeGeometry(shapeAfter).bounds
    const w = bounds.w || 1
    const h = bounds.h || 1
    const { ax, ay, rot, tw, th } = binding.props

    // 1) resize del destino → escalar el anclado (salvo pines)
    if (Math.abs(w - tw) > 0.5 || Math.abs(h - th) > 0.5) {
      if (attached.type !== PIN_TYPE && tw > 0 && th > 0) {
        const s = Math.sqrt((w / tw) * (h / th)) // escala uniforme: no deformar trazos
        if (isFinite(s) && s > 0) editor.resizeShape(attached.id, { x: s, y: s })
      }
      editor.updateBinding<AttachBinding>({ ...binding, props: { ...binding.props, tw: w, th: h } })
    }

    // 2) transformación rígida
    const pageT = editor.getShapePageTransform(shapeAfter)
    const pagePoint = pageT.applyToPoint({ x: bounds.x + ax * w, y: bounds.y + ay * h })
    const fresh = editor.getShape(attached.id)!
    const local = editor.getPointInParentSpace(fresh, pagePoint)
    const parentRot = fresh.parentId.startsWith('page:') ? 0 : editor.getShapePageTransform(fresh.parentId as TLShapeId).rotation()
    editor.updateShape({
      id: fresh.id,
      type: fresh.type,
      x: local.x,
      y: local.y,
      rotation: pageT.rotation() + rot - parentRot,
    })
  }

  /** Si se borra el destino, el anclado se va con él (es parte del objeto). */
  override onBeforeDeleteToShape({ binding }: BindingOnShapeDeleteOptions<AttachBinding>) {
    const attached = this.editor.getShape(binding.fromId)
    if (attached) this.editor.deleteShape(attached.id)
  }
}

/* ------------------------------------------------------------------ */
/* Lógica de anclaje automático                                        */
/* ------------------------------------------------------------------ */

export function getAttachBinding(editor: Editor, shapeId: TLShapeId): AttachBinding | undefined {
  return editor
    .getBindingsFromShape<AttachBinding>(shapeId, ATTACH_TYPE)
    .find(Boolean)
}

/** Punto de referencia para decidir “qué hay debajo”. */
function probePoint(editor: Editor, shape: TLShape) {
  return editor.getShapePageBounds(shape)!.center
}

export function findAttachTarget(editor: Editor, shape: TLShape): TLShape | undefined {
  const point = probePoint(editor, shape)
  const sorted = editor.getCurrentPageShapesSorted()
  for (let i = sorted.length - 1; i >= 0; i--) {
    const s = sorted[i]
    if (s.id === shape.id || NEVER_TARGET.has(s.type)) continue
    if (editor.isShapeHidden(s)) continue
    if (editor.isPointInShape(s, point, { hitInside: true, margin: 0 })) return s
  }
  return undefined
}

export function attachTo(editor: Editor, shape: TLShape, target: TLShape) {
  const bounds = editor.getShapeGeometry(target).bounds
  const inv = Mat.Inverse(editor.getShapePageTransform(target))
  const origin = editor.getShapePageTransform(shape).point()
  const local = Mat.applyToPoint(inv, origin)
  const w = bounds.w || 1
  const h = bounds.h || 1
  const props = {
    ax: (local.x - bounds.x) / w,
    ay: (local.y - bounds.y) / h,
    rot: editor.getShapePageTransform(shape).rotation() - editor.getShapePageTransform(target).rotation(),
    tw: w,
    th: h,
  }
  const existing = getAttachBinding(editor, shape.id)
  if (existing && existing.toId === target.id) {
    editor.updateBinding<AttachBinding>({ ...existing, props })
    return
  }
  if (existing) editor.deleteBinding(existing.id)
  editor.createBinding<AttachBinding>({ type: ATTACH_TYPE, fromId: shape.id, toId: target.id, props })

  // los pines y textos siempre por encima de su destino
  if (shape.type === PIN_TYPE || shape.type === 'text') {
    const sorted = editor.getCurrentPageShapesSorted()
    if (sorted.indexOf(shape) < sorted.findIndex((s) => s.id === target.id)) editor.bringToFront([shape.id])
  }
}

export function detach(editor: Editor, shapeId: TLShapeId) {
  const b = getAttachBinding(editor, shapeId)
  if (b) editor.deleteBinding(b.id)
}

/** Recalcula el anclaje de un conjunto de objetos (crear / actualizar / romper). */
export function reattach(editor: Editor, ids: Iterable<TLShapeId>) {
  const auto = getBoard(editor).autoAttach
  for (const id of ids) {
    const shape = editor.getShape(id)
    if (!shape || !ATTACHABLE_TYPES.has(shape.type)) continue
    if (!auto && shape.type !== PIN_TYPE) continue
    // si el destino también se está moviendo en la misma selección, solo actualizar
    const target = findAttachTarget(editor, shape)
    if (target) attachTo(editor, shape, target)
    else detach(editor, shape.id)
  }
}

/**
 * Engancha el anclaje automático:
 *  - al soltar el mouse revisa los objetos seleccionados y los recién creados
 *  - escucha el evento custom `cb:attach-check` (usado por la herramienta Pin)
 */
export function registerAutoAttach(editor: Editor) {
  const created = new Set<TLShapeId>()
  const offCreate = editor.sideEffects.registerAfterCreateHandler('shape', (shape) => {
    if (ATTACHABLE_TYPES.has(shape.type)) created.add(shape.id)
  })

  const run = () => {
    // mientras se edita un texto esperamos al siguiente “soltar” para anclarlo
    if (editor.getEditingShapeId()) return
    const ids = new Set<TLShapeId>([...editor.getSelectedShapeIds(), ...created])
    created.clear()
    if (ids.size === 0) return
    reattach(editor, ids)
  }

  const onEvent = (info: any) => {
    if (info.type === 'pointer' && info.name === 'pointer_up') {
      editor.timers.setTimeout(run, 0)
    }
    if (info.type === 'keyboard' && info.name === 'key_up' && info.key?.startsWith('Arrow')) {
      editor.timers.setTimeout(run, 0)
    }
  }
  const onCheck = (ids: TLShapeId[]) => reattach(editor, ids)

  editor.on('event', onEvent)
  editor.on('cb:attach-check' as any, onCheck as any)
  return () => {
    offCreate()
    editor.off('event', onEvent)
    editor.off('cb:attach-check' as any, onCheck as any)
  }
}
