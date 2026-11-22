import { useRef } from 'react'
import {
  DefaultContextMenu,
  DefaultContextMenuContent,
  DefaultStylePanel,
  DefaultStylePanelContent,
  DefaultToolbar,
  DefaultToolbarContent,
  Editor,
  TLImageShape,
  TLUiContextMenuProps,
  TLUiOverrides,
  TLUiStylePanelProps,
  TldrawUiMenuGroup,
  TldrawUiMenuItem,
  ToolbarItem,
  useEditor,
  useValue,
} from 'tldraw'
import { BACKGROUND_PRESETS, getBoard, getShow, setBoard } from '../board/settings'
import { ATTACHABLE_TYPES, detach, getAttachBinding, reattach } from '../bindings/AttachBinding'
import { PIN_TYPE, PinShape } from '../shapes/PinShape'
import { THREAD_TYPE, ThreadShape } from '../shapes/ThreadShape'
import {
  CAPTION_FONTS,
  POLAROID_TYPE,
  PolaroidShape,
  convertImageToPolaroid,
  convertPolaroidToImage,
} from '../shapes/PolaroidShape'
import { Select, Slider, Toggle } from '../player/ScenePanel'
import { exportBoard, importBoard } from './io'
import { addShapesAsScenes, playShow, playerAtom, ui } from './uiState'

/* ------------------------------------------------------------------ */
/* Overrides: herramientas, acciones y atajos                          */
/* ------------------------------------------------------------------ */

export const overrides: TLUiOverrides = {
  tools(editor, tools) {
    tools.pin = {
      id: 'pin',
      icon: 'tool-pin' as any,
      label: 'Pin (P)' as any,
      kbd: 'p',
      onSelect: () => editor.setCurrentTool('pin'),
    }
    tools.thread = {
      id: 'thread',
      icon: 'tool-string' as any,
      label: 'Hilo rojo (Y)' as any,
      kbd: 'y',
      onSelect: () => editor.setCurrentTool('thread'),
    }
    tools.camframe = {
      id: 'camframe',
      icon: 'tool-camframe' as any,
      label: 'Marco de cámara (C)' as any,
      kbd: 'c',
      onSelect: () => {
        ui.scenesOpen.set(true)
        editor.setCurrentTool('camframe')
      },
    }
    return tools
  },
  actions(editor, actions) {
    actions['cb-polaroid'] = {
      id: 'cb-polaroid',
      label: 'Convertir en Polaroid' as any,
      kbd: 'shift+o',
      onSelect: () => {
        const ids = editor
          .getSelectedShapes()
          .filter((s): s is TLImageShape => s.type === 'image')
          .map((s) => convertImageToPolaroid(editor, s))
        if (ids.length) editor.select(...ids)
      },
    }
    actions['cb-unpolaroid'] = {
      id: 'cb-unpolaroid',
      label: 'Quitar marco Polaroid' as any,
      onSelect: () => {
        const ids = editor
          .getSelectedShapes()
          .filter((s): s is PolaroidShape => s.type === POLAROID_TYPE)
          .map((s) => convertPolaroidToImage(editor, s))
          .filter(Boolean)
        if (ids.length) editor.select(...(ids as any))
      },
    }
    actions['cb-add-scenes'] = {
      id: 'cb-add-scenes',
      label: 'Agregar a escenas' as any,
      kbd: 'shift+s',
      onSelect: () => {
        addShapesAsScenes(editor, editor.getSelectedShapes())
        ui.scenesOpen.set(true)
      },
    }
    actions['cb-toggle-scenes'] = {
      id: 'cb-toggle-scenes',
      label: 'Panel de escenas' as any,
      kbd: 's',
      onSelect: () => { ui.scenesOpen.set(!ui.scenesOpen.get()) },
    }
    actions['cb-flashlight'] = {
      id: 'cb-flashlight',
      label: 'Linterna libre' as any,
      kbd: 'j',
      onSelect: () => { ui.flashlight.set(!ui.flashlight.get()) },
    }
    actions['cb-play'] = {
      id: 'cb-play',
      label: 'Reproducir' as any,
      kbd: 'shift+enter',
      onSelect: () => playShow(editor),
    }
    actions['cb-detach'] = {
      id: 'cb-detach',
      label: 'Desanclar' as any,
      onSelect: () => editor.getSelectedShapeIds().forEach((id) => detach(editor, id)),
    }
    actions['cb-attach'] = {
      id: 'cb-attach',
      label: 'Anclar a lo que está debajo' as any,
      onSelect: () => reattach(editor, editor.getSelectedShapeIds()),
    }
    return actions
  },
  translations: {
    es: { 'tool.pin': 'Pin', 'tool.string': 'Hilo rojo' },
    en: { 'tool.pin': 'Pin', 'tool.string': 'Red string' },
  } as any,
}

/* ------------------------------------------------------------------ */
/* Toolbar con Pin e Hilo                                               */
/* ------------------------------------------------------------------ */

export function BoardToolbar() {
  return (
    <DefaultToolbar>
      <ToolbarItem tool="pin" />
      <ToolbarItem tool="thread" />
      <ToolbarItem tool="camframe" />
      <DefaultToolbarContent />
    </DefaultToolbar>
  )
}

/* ------------------------------------------------------------------ */
/* Menú contextual                                                      */
/* ------------------------------------------------------------------ */

export function BoardContextMenu(props: TLUiContextMenuProps) {
  const editor = useEditor()
  const sel = useValue('sel', () => editor.getSelectedShapes(), [editor])
  const hasImage = sel.some((s) => s.type === 'image')
  const hasPolaroid = sel.some((s) => s.type === POLAROID_TYPE)
  const hasAttachable = sel.some((s) => ATTACHABLE_TYPES.has(s.type))
  const isAttached = sel.some((s) => getAttachBinding(editor, s.id))
  return (
    <DefaultContextMenu {...props}>
      {sel.length > 0 && (
        <TldrawUiMenuGroup id="corkboard">
          <TldrawUiMenuItem id="cb-add-scenes" label={'🎬 Agregar a escenas' as any} onSelect={() => { addShapesAsScenes(editor, sel); ui.scenesOpen.set(true) }} />
          {hasImage && (
            <TldrawUiMenuItem id="cb-polaroid" label={'📷 Convertir en Polaroid' as any} onSelect={() => {
              const ids = sel.filter((s): s is TLImageShape => s.type === 'image').map((s) => convertImageToPolaroid(editor, s))
              editor.select(...ids)
            }} />
          )}
          {hasPolaroid && (
            <TldrawUiMenuItem id="cb-unpolaroid" label={'🖼 Quitar marco Polaroid' as any} onSelect={() => {
              sel.filter((s): s is PolaroidShape => s.type === POLAROID_TYPE).forEach((s) => convertPolaroidToImage(editor, s))
            }} />
          )}
          {hasAttachable && !isAttached && (
            <TldrawUiMenuItem id="cb-attach" label={'📌 Anclar a lo de abajo' as any} onSelect={() => reattach(editor, sel.map((s) => s.id))} />
          )}
          {isAttached && (
            <TldrawUiMenuItem id="cb-detach" label={'✂ Desanclar' as any} onSelect={() => sel.forEach((s) => detach(editor, s.id))} />
          )}
        </TldrawUiMenuGroup>
      )}
      <DefaultContextMenuContent />
    </DefaultContextMenu>
  )
}

/* ------------------------------------------------------------------ */
/* Panel de estilo extendido (Polaroid / Pin)                          */
/* ------------------------------------------------------------------ */

export function BoardStylePanel(props: TLUiStylePanelProps) {
  const editor = useEditor()
  const polaroids = useValue('pols', () => editor.getSelectedShapes().filter((s) => s.type === POLAROID_TYPE) as PolaroidShape[], [editor])
  const pins = useValue('pins', () => editor.getSelectedShapes().filter((s) => s.type === PIN_TYPE) as PinShape[], [editor])
  const threads = useValue('threads', () => editor.getSelectedShapes().filter((s) => s.type === THREAD_TYPE) as ThreadShape[], [editor])
  const setThread = (props: Partial<ThreadShape['props']>) =>
    editor.updateShapes(threads.map((t) => ({ id: t.id, type: THREAD_TYPE, props })))
  const th = threads[0]?.props

  const setPol = (props: Partial<PolaroidShape['props']>) =>
    editor.updateShapes(polaroids.map((p) => ({ id: p.id, type: POLAROID_TYPE, props })))
  const setPin = (props: Partial<PinShape['props']>) =>
    editor.updateShapes(pins.map((p) => ({ id: p.id, type: PIN_TYPE, props })))

  const p = polaroids[0]?.props
  const pin = pins[0]?.props

  return (
    <DefaultStylePanel {...props}>
      <DefaultStylePanelContent />
      {p && (
        <div className="cb-style">
          <div className="cb-style__title">📷 Polaroid</div>
          <textarea
            className="cb-style__caption"
            placeholder="Caption: explicá siglas, datos, contexto…"
            value={p.caption}
            onChange={(e) => setPol({ caption: e.target.value })}
          />
          <Select label="Marco" value={p.frame} options={{ polaroid: 'Polaroid clásica', clean: 'Marco fino', none: 'Sin marco' }}
            onChange={(frame) => setPol({ frame: frame as any })} />
          <Select label="Letra" value={p.captionFont}
            options={{ marker: 'Marcador', hand: 'Manuscrita', typewriter: 'Máquina de escribir', sans: 'Moderna' }}
            onChange={(captionFont) => setPol({ captionFont: captionFont as any })} />
          <Slider label="Tamaño" unit="px" min={10} max={72} step={1} value={p.captionSize} onChange={(captionSize) => setPol({ captionSize })} />
          <div className="cb-seg">
            <button className={p.bold ? 'is-on' : ''} onClick={() => setPol({ bold: !p.bold })} style={{ fontWeight: 700 }}>B</button>
            <button className={p.italic ? 'is-on' : ''} onClick={() => setPol({ italic: !p.italic })} style={{ fontStyle: 'italic' }}>I</button>
            {(['start', 'middle', 'end'] as const).map((a) => (
              <button key={a} className={p.captionAlign === a ? 'is-on' : ''} onClick={() => setPol({ captionAlign: a })}>
                {a === 'start' ? '⇤' : a === 'middle' ? '↔' : '⇥'}
              </button>
            ))}
          </div>
          <Toggle label="Sombra" value={p.shadow} onChange={(shadow) => setPol({ shadow })} />
          <p className="cb-style__hint" style={{ fontFamily: CAPTION_FONTS[p.captionFont] }}>Doble clic en la foto para escribir directo.</p>
        </div>
      )}
      {th && (
        <div className="cb-style">
          <div className="cb-style__title">🧶 Hilo</div>
          <Slider label="Flojo" unit="%" min={0} max={40} step={1} value={Math.round(th.slack * 100)}
            onChange={(v) => setThread({ slack: v / 100 })} />
          <Select label="Material" value={th.material} options={{ wool: 'Lana (trenzado)', twine: 'Cordel', nylon: 'Nylon (liso)' }}
            onChange={(material) => setThread({ material: material as any })} />
          <p className="cb-style__hint">Mové un pin y el hilo se balancea. Color y grosor arriba.</p>
        </div>
      )}
      {pin && (
        <div className="cb-style">
          <div className="cb-style__title">📌 Pin</div>
          <Select label="Colgante" value={pin.dangle} options={{ none: 'Nada', string: 'Cordel colgando', tag: 'Etiqueta colgando' }}
            onChange={(dangle) => setPin({ dangle: dangle as any })} />
          {pin.dangle === 'tag' && (
            <input className="cb-style__input" placeholder="Texto de la etiqueta" value={pin.label} onChange={(e) => setPin({ label: e.target.value })} />
          )}
          <p className="cb-style__hint">
            {getAttachBinding(editor, pins[0].id) ? '🔗 Anclado: se mueve con su objeto.' : 'Suelto en el tablero. Arrastralo sobre una nota/foto para anclarlo.'}
          </p>
        </div>
      )}
    </DefaultStylePanel>
  )
}

/* ------------------------------------------------------------------ */
/* Zoom suave con indicador                                             */
/* ------------------------------------------------------------------ */

export function ZoomIndicator() {
  const editor = useEditor()
  const zoom = useValue('zoom', () => editor.getZoomLevel(), [editor])
  const anim = { animation: { duration: 180 } }
  const center = () => editor.getViewportScreenCenter()
  return (
    <div className="cb-zoom" onPointerDown={(e) => e.stopPropagation()}>
      <button onClick={() => editor.zoomOut(center(), anim)} title="Alejar (−)">−</button>
      <button className="cb-zoom__pct" onClick={() => editor.resetZoom(center(), anim)} title="Volver a 100 % (Shift+0)">
        {Math.round(zoom * 100)}%
      </button>
      <button onClick={() => editor.zoomIn(center(), anim)} title="Acercar (+)">+</button>
      <span className="cb-zoom__sep" />
      <button onClick={() => editor.zoomToFit(anim)} title="Ver todo (Shift+1)">⤢</button>
    </div>
  )
}

/** Pasos de zoom geométricos: cada paso es ×factor (1.2 = 20 %). */
export function makeZoomSteps(factor: number) {
  const steps: number[] = []
  for (let z = 1; z >= 0.04; z /= factor) steps.unshift(+z.toFixed(4))
  for (let z = 1 * factor; z <= 8.01; z *= factor) steps.push(+z.toFixed(4))
  return steps
}

export function applyCameraSettings(editor: Editor) {
  const b = getBoard(editor)
  editor.setCameraOptions({
    zoomSteps: makeZoomSteps(b.zoomStep),
    wheelBehavior: b.wheel,
    zoomSpeed: 0.6,
  })
}

/* ------------------------------------------------------------------ */
/* Barra superior                                                       */
/* ------------------------------------------------------------------ */

export function TopBar() {
  const editor = useEditor()
  const menu = useValue(ui.menu)
  const scenesOpen = useValue(ui.scenesOpen)
  const flashlight = useValue(ui.flashlight)
  const sceneCount = useValue('count', () => getShow(editor).scenes.length, [editor])
  const fileRef = useRef<HTMLInputElement>(null)
  const toggle = (m: typeof menu) => ui.menu.set(menu === m ? 'none' : m)

  return (
    <div className="cb-topbar" onPointerDown={(e) => e.stopPropagation()}>
      <button className={menu === 'background' ? 'is-on' : ''} onClick={() => toggle('background')}>🎨 Fondo</button>
      <button className={scenesOpen ? 'is-on' : ''} onClick={() => ui.scenesOpen.set(!scenesOpen)}>
        🎬 Escenas{sceneCount ? ` (${sceneCount})` : ''}
      </button>
      <button onClick={() => playShow(editor)} disabled={!sceneCount} title="Reproducir (Shift+Enter)">▶ Play</button>
      <button className={flashlight ? 'is-on' : ''} onClick={() => ui.flashlight.set(!flashlight)} title="Linterna libre (J)">🔦</button>
      <button className={menu === 'settings' ? 'is-on' : ''} onClick={() => toggle('settings')} title="Ajustes">⚙</button>
      <button onClick={() => exportBoard(editor)} title="Guardar tablero como JSON">💾</button>
      <button onClick={() => fileRef.current?.click()} title="Abrir tablero JSON">📂</button>
      <button className={menu === 'help' ? 'is-on' : ''} onClick={() => toggle('help')} title="Atajos">?</button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]
          if (f) await importBoard(editor, f)
          e.target.value = ''
        }}
      />
      {menu === 'background' && <BackgroundMenu />}
      {menu === 'settings' && <SettingsMenu />}
      {menu === 'help' && <HelpMenu />}
    </div>
  )
}

function BackgroundMenu() {
  const editor = useEditor()
  const bg = useValue('bg', () => getBoard(editor).background, [editor])
  const setBg = (patch: Partial<typeof bg>) => setBoard(editor, (b) => ({ ...b, background: { ...b.background, ...patch } }))
  const imgRef = useRef<HTMLInputElement>(null)
  return (
    <div className="cb-pop">
      <div className="cb-swatches">
        {BACKGROUND_PRESETS.map((p) => (
          <button
            key={p.id}
            className={`cb-swatch ${bg.kind === p.bg.kind && bg.color === p.bg.color ? 'is-on' : ''}`}
            onClick={() => setBg(p.bg)}
            title={p.label}
          >
            <i style={{ background: p.bg.color }} data-kind={p.bg.kind} />
            <span>{p.label}</span>
          </button>
        ))}
      </div>
      <label className="cb-field">
        <span>Tono / color</span>
        <input type="color" value={bg.color} onChange={(e) => setBg({ color: e.target.value })} />
        <em>{bg.color}</em>
      </label>
      <Slider label="Escala textura" unit="×" min={0.3} max={3} step={0.05} value={bg.scale} onChange={(scale) => setBg({ scale })} />
      <Slider label="Bordes oscuros" unit="%" min={0} max={90} step={1} value={bg.vignette * 100} onChange={(v) => setBg({ vignette: v / 100 })} />
      <div className="cb-row">
        <button className="cb-btn" onClick={() => imgRef.current?.click()}>🖼 Imagen propia…</button>
        {bg.kind === 'image' && (
          <Select label="" value={bg.imageMode ?? 'world'} options={{ world: 'Se mueve con el tablero', screen: 'Fija de fondo' }}
            onChange={(m) => setBg({ imageMode: m as any })} />
        )}
      </div>
      <input
        ref={imgRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (!f) return
          const r = new FileReader()
          r.onload = () => setBg({ kind: 'image', imageUrl: String(r.result) })
          r.readAsDataURL(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}

function SettingsMenu() {
  const editor = useEditor()
  const b = useValue('board', () => getBoard(editor), [editor])
  const set = (patch: Partial<typeof b>) => {
    setBoard(editor, patch)
    applyCameraSettings(editor)
  }
  return (
    <div className="cb-pop">
      <Toggle label="Anclar highlights/textos/pines al objeto de abajo" value={b.autoAttach} onChange={(autoAttach) => set({ autoAttach })} />
      <Toggle label="Imágenes pegadas → Polaroid" value={b.autoPolaroid} onChange={(autoPolaroid) => set({ autoPolaroid })} />
      <Select label="Rueda del mouse" value={b.wheel} options={{ zoom: 'Zoom (tablero)', pan: 'Desplazar (Ctrl = zoom)' }}
        onChange={(wheel) => set({ wheel: wheel as any })} />
      <Slider label="Paso de zoom" unit="%" min={5} max={50} step={1} value={Math.round((b.zoomStep - 1) * 100)}
        onChange={(v) => set({ zoomStep: 1 + v / 100 })} />
    </div>
  )
}

function HelpMenu() {
  const rows: [string, string][] = [
    ['Clic derecho + arrastrar', 'Mover el tablero (mano automática)'],
    ['Espacio + arrastrar / rueda (clic medio)', 'Mover el tablero'],
    ['Rueda', 'Zoom suave · Ctrl+rueda en trackpad'],
    ['+ / −  ·  Shift+0  ·  Shift+1', 'Zoom por pasos · 100 % · ver todo'],
    ['P', 'Pin (se ancla a la nota/foto de abajo)'],
    ['Y', 'Hilo rojo: arrastrá de un pin (o nota/foto) a otro; si no hay pin, se clava uno'],
    ['N · T · Shift+D', 'Nota · Texto · Resaltador'],
    ['Ctrl+V', 'Pegar imagen / captura (→ Polaroid)'],
    ['Shift+O', 'Convertir imagen seleccionada en Polaroid'],
    ['Doble clic en Polaroid', 'Escribir el caption'],
    ['S · Shift+S', 'Panel de escenas · agregar selección'],
    ['C', 'Dibujar un marco de cámara (vista editable)'],
    ['Shift+Enter', 'Reproducir'],
    ['Espacio · ← → · Esc · F', 'Pausa · anterior/siguiente · salir · pantalla completa'],
    ['Barra de tiempo', 'Arrastrala para adelantar o rebobinar la cinemática'],
    ['J', 'Linterna libre que sigue al mouse'],
  ]
  return (
    <div className="cb-pop cb-pop--help">
      <table>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}><td><kbd>{k}</kbd></td><td>{v}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Numeración de escenas sobre el lienzo                               */
/* ------------------------------------------------------------------ */

export function SceneBadges() {
  const editor = useEditor()
  const open = useValue(ui.scenesOpen)
  const pick = useValue(ui.pickMode)
  const player = useValue(playerAtom)
  const playing = useValue('playing', () => (player?.status.get() ?? 'idle') !== 'idle', [player])
  const zoom = useValue('z', () => editor.getZoomLevel(), [editor])
  const items = useValue(
    'badges',
    () =>
      getShow(editor).scenes.map((s, i) => {
        const b = player?.sceneBounds(s)
        return b ? { i, id: s.id, x: b.x, y: b.y, w: b.w, h: b.h, view: s.target.kind === 'view' } : null
      }),
    [editor, player]
  )
  if ((!open && !pick) || playing) return null
  const k = 1 / zoom
  return (
    <>
      {items.map(
        (it) =>
          it && (
            <div key={it.id}>
              {it.view && (
                <div className="cb-viewframe" style={{ left: it.x, top: it.y, width: it.w, height: it.h, borderWidth: 2 * k }} />
              )}
              <div
                className="cb-badge"
                style={{ left: it.x, top: it.y, transform: `translate(-40%, -40%) scale(${k})` }}
              >
                {it.i + 1}
              </div>
            </div>
          )
      )}
    </>
  )
}
