import { useEffect, useRef, useState } from 'react'
import {
  Editor,
  TLComponents,
  TLShape,
  TLImageShape,
  Tldraw,
  inlineBase64AssetStore,
  react,
  useValue,
} from 'tldraw'
import 'tldraw/tldraw.css'
import './fonts'
import './styles.css'

import { BoardBackground } from './board/BoardBackground'
import { getBoard } from './board/settings'
import { AttachBindingUtil, registerAutoAttach } from './bindings/AttachBinding'
import { PinShapeUtil, PinTool } from './shapes/PinShape'
import { PolaroidShapeUtil, convertImageToPolaroid } from './shapes/PolaroidShape'
import { CAMFRAME_TYPE, CameraFrameShapeUtil, CameraFrameTool } from './shapes/CameraFrameShape'
import { ThreadBindingUtil, ThreadShapeUtil, ThreadTool } from './shapes/ThreadShape'
import { PLACE_TYPES, canAnimateMount, playPlaceAnimation } from './shapes/mountAnim'
import { SpotPathRecorder } from './player/SpotPathRecorder'
import { Player } from './player/Player'
import { PlayerControls } from './player/PlayerControls'
import { ScenePanel } from './player/ScenePanel'
import { ShowOverlay } from './player/ShowOverlay'
import {
  BoardContextMenu,
  BoardStylePanel,
  BoardToolbar,
  SceneBadges,
  TopBar,
  ZoomIndicator,
  applyCameraSettings,
  overrides,
} from './ui/BoardUi'
import { RecordingModal } from './ui/RecordingModal'
import { playerAtom, registerPickMode, ui } from './ui/uiState'
import { ICONS } from './ui/icons'
import { getAssetUrlsByImport } from '@tldraw/assets/imports.vite'

// fuentes, íconos y traducciones empaquetados localmente: funciona sin internet
const assetUrls = getAssetUrlsByImport()
assetUrls.icons = { ...assetUrls.icons, ...ICONS } as any

const shapeUtils = [PinShapeUtil, PolaroidShapeUtil, CameraFrameShapeUtil, ThreadShapeUtil]
const bindingUtils = [AttachBindingUtil, ThreadBindingUtil]
const tools = [PinTool, CameraFrameTool, ThreadTool]

/** Licencia de tldraw opcional (ver README): VITE_TLDRAW_LICENSE_KEY en un archivo .env */
const licenseKey = (import.meta as any).env?.VITE_TLDRAW_LICENSE_KEY as string | undefined

/**
 * Visibilidad de cada objeto:
 *  - marcos de cámara: solo con el panel de escenas abierto y fuera de la reproducción
 *  - modo “revelar”: los objetos de escenas futuras se ocultan (y los hilos que los tocan)
 */
function getShapeVisibility(shape: TLShape, editor: Editor) {
  const p = playerAtom.get()
  const playing = !!p && p.status.get() !== 'idle'
  if (shape.type === CAMFRAME_TYPE) return playing || !ui.scenesOpen.get() ? 'hidden' : 'inherit'
  if (!playing) return 'inherit'
  const hidden = p!.hiddenIds.get()
  if (hidden.size === 0) return 'inherit'
  if (hidden.has(shape.id)) return 'hidden'
  if (shape.type === 'arrow') {
    for (const b of editor.getBindingsFromShape(shape.id, 'arrow')) if (hidden.has(b.toId)) return 'hidden'
  }
  return 'inherit'
}

const components: TLComponents = {
  Background: BoardBackground,
  Grid: null,
  OnTheCanvas: SceneBadges,
  TopPanel: TopBar,
  Toolbar: BoardToolbar,
  StylePanel: BoardStylePanel,
  ContextMenu: BoardContextMenu,
  NavigationPanel: ZoomIndicator,
  HelpMenu: null,
}

export default function App() {
  const [editor, setEditor] = useState<Editor | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const player = useValue(playerAtom)
  const status = useValue('status', () => player?.status.get() ?? 'idle', [player])
  const playing = status !== 'idle'

  /* ---------------- montaje del editor ---------------- */
  const onMount = (ed: Editor) => {
    setEditor(ed)
    if (import.meta.env.DEV) (window as any).editor = ed // solo en desarrollo: depurar desde la consola
    const player = new Player(ed)
    playerAtom.set(player)
    if (import.meta.env.DEV) (window as any).player = player
    ed.user.updateUserPreferences({ locale: 'es' })
    applyCameraSettings(ed)

    const disposers = [
      registerAutoAttach(ed),
      registerPickMode(ed),
      // animación de “apoyar en el corcho” para lo que crea el usuario
      ed.sideEffects.registerAfterCreateHandler('shape', (shape, source) => {
        if (source === 'user' && PLACE_TYPES.has(shape.type) && canAnimateMount()) playPlaceAnimation(shape.id)
      }),
      // imágenes pegadas → Polaroid automáticamente
      ed.sideEffects.registerAfterCreateHandler('shape', (shape) => {
        if (shape.type !== 'image' || !getBoard(ed).autoPolaroid) return
        ed.timers.setTimeout(() => {
          const img = ed.getShape<TLImageShape>(shape.id)
          if (!img || !img.props.assetId) return
          const wasSelected = ed.getSelectedShapeIds().includes(img.id)
          const id = convertImageToPolaroid(ed, img)
          if (wasSelected) ed.select(id)
        }, 60)
      }),
      // si cambian los ajustes de zoom/rueda en el documento (ej. al importar)
      (() => {
        let last = ''
        return react('camera-settings', () => {
          const b = getBoard(ed)
          const key = `${b.wheel}|${b.zoomStep}`
          if (key === last) return
          last = key
          // fuera del ciclo reactivo: si no, cada frame de cámara lo re-dispararía
          queueMicrotask(() => applyCameraSettings(ed))
        })
      })(),
    ]
    return () => disposers.forEach((d) => d())
  }

  /* ---------------- teclado del Modo Reproducción ---------------- */
  useEffect(() => {
    if (!editor || !player) return
    const onKey = (e: KeyboardEvent) => {
      const st = player.status.get()
      if (st === 'idle') return
      const k = e.key
      const handled = [' ', 'ArrowRight', 'ArrowLeft', 'PageDown', 'PageUp', 'Escape', 'f', 'F'].includes(k)
      if (!handled) return
      e.preventDefault()
      e.stopPropagation()
      if (k === ' ') player.toggle()
      else if (k === 'ArrowRight' || k === 'PageDown') player.next()
      else if (k === 'ArrowLeft' || k === 'PageUp') player.prev()
      else if (k === 'Escape') player.stop()
      else if (k === 'f' || k === 'F')
        document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [editor, player])

  // cerrar popovers de la barra superior al tocar el lienzo
  useEffect(() => {
    if (!editor) return
    const close = (info: any) => {
      if (info.type === 'pointer' && info.name === 'pointer_down') ui.menu.set('none')
    }
    editor.on('event', close)
    return () => {
      editor.off('event', close)
    }
  }, [editor])

  return (
    <div ref={stageRef} className={`cb-stage ${playing ? 'is-playing' : ''}`}>
      <Tldraw
        persistenceKey="corkboard-studio"
        assets={inlineBase64AssetStore}
        shapeUtils={shapeUtils}
        bindingUtils={bindingUtils}
        tools={tools}
        overrides={overrides}
        components={components}
        assetUrls={assetUrls}
        hideUi={playing}
        options={{ rightClickPanning: true }}
        getShapeVisibility={getShapeVisibility}
        licenseKey={licenseKey}
        onMount={onMount}
      />
      {editor && (
        <>
          <ShowOverlay editor={editor} />
          {!playing && <ScenePanel editor={editor} stage={stageRef.current} />}
          <PlayerControls editor={editor} />
          <SpotPathRecorder editor={editor} />
          <RecordingModal />
        </>
      )}
    </div>
  )
}
