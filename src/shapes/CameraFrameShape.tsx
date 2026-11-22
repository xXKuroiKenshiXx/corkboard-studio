/**
 * MARCO DE CÁMARA (“vista”) — un rectángulo que define exactamente qué
 * encuadra la cámara en una escena. Se mueve y redimensiona como cualquier
 * forma (con proporción 16:9, 9:16, 4:3, 1:1 o libre) y es invisible
 * mientras se reproduce y al exportar. Solo se muestra con el panel de
 * escenas abierto.
 *
 * Herramienta: tecla C (arrastrá para dibujar el encuadre → se agrega como escena).
 */
import {
  BaseBoxShapeTool,
  BaseBoxShapeUtil,
  HTMLContainer,
  RecordProps,
  T,
  TLResizeInfo,
  TLShape,
  resizeBox,
  useEditor,
  useValue,
} from 'tldraw'
import { getShow } from '../board/settings'

export const CAMFRAME_TYPE = 'camframe' as const
export type FrameAspect = 'free' | '16:9' | '9:16' | '4:3' | '1:1'

declare module '@tldraw/tlschema' {
  export interface TLGlobalShapePropsMap {
    [CAMFRAME_TYPE]: { w: number; h: number; aspect: FrameAspect }
  }
}

export type CameraFrameShape = TLShape<typeof CAMFRAME_TYPE>

export const ASPECTS: Record<FrameAspect, number | null> = {
  free: null,
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '4:3': 4 / 3,
  '1:1': 1,
}

export class CameraFrameShapeUtil extends BaseBoxShapeUtil<CameraFrameShape> {
  static override type = CAMFRAME_TYPE
  static override props: RecordProps<CameraFrameShape> = {
    w: T.number,
    h: T.number,
    aspect: T.literalEnum('free', '16:9', '9:16', '4:3', '1:1'),
  }

  override getDefaultProps(): CameraFrameShape['props'] {
    return { w: 1280, h: 720, aspect: '16:9' }
  }

  override canBind() { return false }
  override canEdit() { return false }
  override hideRotateHandle() { return true }
  override isAspectRatioLocked(shape: CameraFrameShape) { return shape.props.aspect !== 'free' }
  override canSnap() { return true }
  override toSvg() { return null }
  override hideInMinimap() { return true }

  /** mantiene la proporción elegida (también al dibujarlo con la herramienta) */
  override onBeforeCreate(next: CameraFrameShape) {
    return fixAspect(next)
  }
  override onBeforeUpdate(_prev: CameraFrameShape, next: CameraFrameShape) {
    return fixAspect(next)
  }

  override onResize(shape: CameraFrameShape, info: TLResizeInfo<CameraFrameShape>) {
    return resizeBox(shape, info)
  }

  override getIndicatorPath(shape: CameraFrameShape) {
    const p = new Path2D()
    p.rect(0, 0, shape.props.w, shape.props.h)
    return p
  }

  override component(shape: CameraFrameShape) {
    return <CameraFrame shape={shape} />
  }
}

function CameraFrame({ shape }: { shape: CameraFrameShape }) {
  const editor = useEditor()
  const zoom = useValue('z', () => editor.getZoomLevel(), [editor])
  const index = useValue(
    'scene-index',
    () => getShow(editor).scenes.findIndex((s) => s.target.kind === 'shape' && s.target.shapeId === shape.id),
    [editor, shape.id]
  )
  const k = 1 / zoom
  const { w, h } = shape.props
  return (
    <HTMLContainer className="cb-camframe" style={{ width: w, height: h, ['--k' as any]: k }}>
      <div className="cb-camframe__border" style={{ borderWidth: 2 * k }} />
      {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
        <i key={c} className={`cb-camframe__corner cb-camframe__corner--${c}`} style={{ width: 22 * k, height: 22 * k, borderWidth: 4 * k }} />
      ))}
      <div className="cb-camframe__label" style={{ transform: `scale(${k})` }}>
        🎥 {index >= 0 ? `Vista · escena ${index + 1}` : 'Vista'} · {shape.props.aspect === 'free' ? 'libre' : shape.props.aspect}
      </div>
    </HTMLContainer>
  )
}

function fixAspect(s: CameraFrameShape): CameraFrameShape | void {
  const r = ASPECTS[s.props.aspect]
  if (!r) return
  const h = s.props.w / r
  if (Math.abs(h - s.props.h) < 0.5) return
  return { ...s, props: { ...s.props, h } }
}

export class CameraFrameTool extends BaseBoxShapeTool {
  static override id = 'camframe'
  static override initial = 'idle'
  override shapeType = CAMFRAME_TYPE

  /** Se llama al terminar de dibujar el marco: lo agrega como escena y vuelve a “seleccionar”. */
  override onCreate(shape: TLShape | null) {
    const editor = this.editor
    if (editor.getInstanceState().isToolLocked) editor.setCurrentTool('camframe')
    else editor.setCurrentTool('select.idle')
    if (shape) {
      editor.select(shape.id)
      editor.timers.setTimeout(() => editor.emit('cb:camframe-created' as any, shape.id), 0)
    }
  }
}
