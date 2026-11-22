/**
 * PANEL DE ESCENAS (opcional, se abre con 🎬 o la tecla S)
 *
 *   [Escena 1] ──(nodo de transición)── [Escena 2] ──(nodo)── [Escena 3] …
 *
 * Cada “nodo” entre tarjetas es la transición que lleva a la escena siguiente.
 * Al tocarlo se despliega su editor: tipo (suave, corte, gaussiana, fundido,
 * glitch, barrido, golpe de zoom), duración, curva, intensidad y “Probar”,
 * que reproduce solo ese tramo. Las tarjetas se reordenan arrastrando.
 */
import { useState } from 'react'
import { Editor, useValue } from 'tldraw'
import {
  EasingName,
  EntranceType,
  SpotAnimType,
  SHOW_PRESETS,
  Scene,
  ShowEffects,
  Transition,
  TransitionType,
  getShow,
  setShow,
} from '../board/settings'
import { EASING_LABELS } from './easing'
import { ASPECTS, CAMFRAME_TYPE, CameraFrameShape, FrameAspect } from '../shapes/CameraFrameShape'
import { ENTRANCES } from './entrances'
import { SPOT_ANIMS } from './spotAnim'
import {
  addCurrentViewAsScene,
  addShapesAsScenes,
  moveScene,
  playShow,
  playerAtom,
  recordShow,
  removeScene,
  ui,
  updateScene,
} from '../ui/uiState'

export const TRANSITIONS: Record<TransitionType, { icon: string; label: string; hint: string }> = {
  smooth: { icon: '〰', label: 'Suave', hint: 'Paneo + zoom cinematográfico' },
  cut: { icon: '✂', label: 'Corte', hint: 'Salto directo' },
  gaussian: { icon: '◌', label: 'Gaussiana', hint: 'Movimiento con desenfoque' },
  fade: { icon: '◐', label: 'Fundido', hint: 'Fundido a negro' },
  glitch: { icon: '▚', label: 'Glitch', hint: 'Interferencia digital' },
  whip: { icon: '➶', label: 'Barrido', hint: 'Whip pan con desenfoque de movimiento' },
  punch: { icon: '✸', label: 'Golpe', hint: 'Zoom con rebote' },
  thread: { icon: '🧶', label: 'Hilo', hint: 'La cámara recorre el hilo rojo que une ambas escenas (si no hay hilo, va suave)' },
}

export function ScenePanel({ editor, stage }: { editor: Editor; stage: HTMLElement | null }) {
  const open = useValue(ui.scenesOpen)
  const show = useValue('show', () => getShow(editor), [editor])
  const pickMode = useValue(ui.pickMode)
  const openTr = useValue(ui.openTransition)
  const openScene = useValue(ui.openScene)
  const [showFx, setShowFx] = useState(false)
  const [drag, setDrag] = useState<number | null>(null)

  if (!open) return null
  const scenes = show.scenes

  return (
    <aside className="cb-panel cb-scenes" onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
      <header className="cb-panel__head">
        <span>🎬 Escenas</span>
        <button className="cb-icon" onClick={() => ui.scenesOpen.set(false)} title="Cerrar (S)">✕</button>
      </header>

      <div className="cb-row cb-row--wrap">
        <button
          className="cb-btn"
          onClick={() => addShapesAsScenes(editor, editor.getSelectedShapes())}
          title="Agrega lo seleccionado, en orden"
        >
          ＋ Selección
        </button>
        <button className="cb-btn" onClick={() => addCurrentViewAsScene(editor)} title="Guarda el encuadre actual">
          ＋ Vista actual
        </button>
        <button
          className={`cb-btn ${pickMode ? 'is-on' : ''}`}
          onClick={() => ui.pickMode.set(!pickMode)}
          title="Hacé clic en los objetos del tablero en el orden que quieras"
        >
          🎯 {pickMode ? 'Eligiendo… (Esc)' : 'Elegir en tablero'}
        </button>
      </div>

      <div className="cb-scenes__list">
        {scenes.length === 0 && (
          <p className="cb-empty">
            Todavía no hay escenas. Seleccioná notas o fotos y tocá <b>＋ Selección</b>, o activá <b>🎯 Elegir</b> y hacé
            clic en el tablero en el orden de tu historia.
          </p>
        )}
        {scenes.map((scene, i) => (
          <div key={scene.id}>
            <TransitionNode
              editor={editor}
              scene={scene}
              index={i}
              intro={i === 0}
              introDuration={show.effects.introDuration}
              open={openTr === scene.id}
            />
            <SceneCard
              editor={editor}
              scene={scene}
              index={i}
              expanded={openScene === scene.id}
              dragging={drag === i}
              onDragStart={() => setDrag(i)}
              onDrop={() => {
                if (drag !== null && drag !== i) moveScene(editor, drag, i)
                setDrag(null)
              }}
            />
          </div>
        ))}
      </div>

      <section className="cb-fx">
        <button className="cb-fx__toggle" onClick={() => setShowFx(!showFx)}>
          ✨ Efectos y estilo <span>{showFx ? '▾' : '▸'}</span>
        </button>
        {showFx && <EffectsEditor editor={editor} effects={show.effects} preset={show.preset} />}
      </section>

      <footer className="cb-scenes__foot">
        <button className="cb-btn cb-btn--primary" onClick={() => playShow(editor)} disabled={!scenes.length}>
          ▶ Reproducir
        </button>
        <button
          className="cb-btn cb-btn--rec"
          onClick={() => stage && recordShow(editor, stage)}
          disabled={!scenes.length}
          title="Graba toda la secuencia y te da el video al terminar"
        >
          ⏺ Grabar video
        </button>
      </footer>
    </aside>
  )
}

/* ------------------------------------------------------------------ */

function SceneCard(props: {
  editor: Editor
  scene: Scene
  index: number
  expanded: boolean
  dragging: boolean
  onDragStart(): void
  onDrop(): void
}) {
  const { editor, scene, index, expanded } = props
  const missing = useValue(
    'missing',
    () => scene.target.kind === 'shape' && !editor.getShape(scene.target.shapeId),
    [editor, scene]
  )

  const focus = () => {
    const p = playerAtom.get()
    if (!p || missing) return
    const b = p.sceneBounds(scene)
    if (b) editor.zoomToBounds(b, { animation: { duration: 500 }, inset: scene.padding })
    if (scene.target.kind === 'shape') editor.select(scene.target.shapeId)
  }

  return (
    <div
      className={`cb-scene ${props.dragging ? 'is-dragging' : ''} ${missing ? 'is-missing' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        props.onDragStart()
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={props.onDrop}
    >
      <div className="cb-scene__main">
        <span className="cb-scene__grip" title="Arrastrá para reordenar">⋮⋮</span>
        <span className="cb-scene__num">{index + 1}</span>
        <input
          className="cb-scene__label"
          value={scene.label}
          onChange={(e) => updateScene(editor, scene.id, { label: e.target.value })}
        />
        <button className="cb-icon" title="Ir a la escena" onClick={focus}>👁</button>
        <button className="cb-icon" title="Reproducir desde acá" onClick={() => playShow(editor, index)}>▶</button>
        <button
          className="cb-icon"
          title="Opciones"
          onClick={() => ui.openScene.set(expanded ? null : scene.id)}
        >
          ⚙
        </button>
        <button className="cb-icon" title="Quitar" onClick={() => removeScene(editor, scene.id)}>✕</button>
      </div>
      {missing && <div className="cb-scene__warn">El objeto fue borrado: se saltea.</div>}
      {(scene.entrance !== 'none' || scene.spotAnim.type !== 'none') && !expanded && (
        <div className="cb-scene__tags">
          {scene.entrance !== 'none' && <span>{ENTRANCES[scene.entrance].icon} {ENTRANCES[scene.entrance].label}</span>}
          {scene.spotAnim.type !== 'none' && <span>🔦 {SPOT_ANIMS[scene.spotAnim.type].label}</span>}
        </div>
      )}
      {expanded && (
        <div className="cb-scene__opts">
          <Slider label="Pausa en escena" unit="s" min={0} max={12} step={0.1} value={scene.hold}
            onChange={(hold) => updateScene(editor, scene.id, { hold })} />
          <FrameControls editor={editor} scene={scene} />
          {scene.target.kind === 'shape' && (
            <Slider label="Margen" unit="px" min={0} max={400} step={5} value={scene.padding}
              onChange={(padding) => updateScene(editor, scene.id, { padding })} />
          )}
          <Toggle label="Ken Burns (zoom lento)" value={scene.kenBurns.enabled}
            onChange={(enabled) => updateScene(editor, scene.id, (s) => ({ ...s, kenBurns: { ...s.kenBurns, enabled } }))} />
          {scene.kenBurns.enabled && (
            <>
              <Slider label="Acercamiento" unit="%" min={-20} max={30} step={1} value={Math.round(scene.kenBurns.zoom * 100)}
                onChange={(v) => updateScene(editor, scene.id, (s) => ({ ...s, kenBurns: { ...s.kenBurns, zoom: v / 100 } }))} />
              <Select label="Deriva" value={scene.kenBurns.drift}
                options={{ none: 'Ninguna', left: '← Izquierda', right: 'Derecha →', up: '↑ Arriba', down: 'Abajo ↓' }}
                onChange={(drift) => updateScene(editor, scene.id, (s) => ({ ...s, kenBurns: { ...s.kenBurns, drift: drift as any } }))} />
            </>
          )}
          <h5>📌 Entrada del objeto</h5>
          <div className="cb-tgrid cb-tgrid--sm">
            {(Object.keys(ENTRANCES) as EntranceType[]).map((k) => (
              <button key={k} className={`cb-tbtn ${scene.entrance === k ? 'is-on' : ''}`} title={ENTRANCES[k].hint}
                onClick={() => updateScene(editor, scene.id, { entrance: k })}>
                <span>{ENTRANCES[k].icon}</span>{ENTRANCES[k].label}
              </button>
            ))}
          </div>

          <h5>🔦 Linterna</h5>
          <Select label="Luz" value={scene.spotlight}
            options={{ inherit: 'Como el global', on: 'Encendida', off: 'Apagada' }}
            onChange={(v) => updateScene(editor, scene.id, { spotlight: v as Scene['spotlight'] })} />
          <div className="cb-tgrid cb-tgrid--sm">
            {(Object.keys(SPOT_ANIMS) as SpotAnimType[]).map((k) => (
              <button key={k} className={`cb-tbtn ${scene.spotAnim.type === k ? 'is-on' : ''}`} title={SPOT_ANIMS[k].hint}
                onClick={() => {
                  if (k === 'custom' && !scene.spotAnim.path?.length) {
                    ui.spotRecording.set(scene.id)
                    return
                  }
                  updateScene(editor, scene.id, (s) => ({
                    ...s,
                    spotAnim: { ...s.spotAnim, type: k },
                    hold: k === 'none' ? s.hold : Math.max(s.hold, +(s.spotAnim.duration + 0.6).toFixed(1)),
                    spotlight: k !== 'none' && s.spotlight === 'off' ? 'on' : s.spotlight,
                  }))
                }}>
                <span>{SPOT_ANIMS[k].icon}</span>{SPOT_ANIMS[k].label}
              </button>
            ))}
          </div>
          {scene.spotAnim.type !== 'none' && (
            <>
              <Slider label="Duración linterna" unit="s" min={0.4} max={8} step={0.1} value={scene.spotAnim.duration}
                onChange={(duration) => updateScene(editor, scene.id, (s) => ({ ...s, spotAnim: { ...s.spotAnim, duration }, hold: Math.max(s.hold, +(duration + 0.6).toFixed(1)) }))} />
              <div className="cb-row cb-row--wrap">
                {['search', 'sweep'].includes(scene.spotAnim.type) && (
                  <button className="cb-btn" title="Otro recorrido al azar"
                    onClick={() => updateScene(editor, scene.id, (s) => ({ ...s, spotAnim: { ...s.spotAnim, seed: Math.floor(Math.random() * 1e6) } }))}>
                    🎲 Otro recorrido
                  </button>
                )}
                <button className="cb-btn" onClick={() => ui.spotRecording.set(scene.id)}>🎥 Grabar a mano</button>
                <button className="cb-btn" onClick={() => playerAtom.get()?.play(0, { only: index })}>▶ Probar</button>
              </div>
              {!getShow(editor).effects.spotlight.enabled && scene.spotlight === 'inherit' && (
                <p className="cb-warn">La linterna global está apagada: activala en ✨ Efectos o poné “Encendida”.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** Si la escena es un marco de cámara: proporción y atajos de tamaño. */
function FrameControls({ editor, scene }: { editor: Editor; scene: Scene }) {
  const frame = useValue(
    'frame',
    () => (scene.target.kind === 'shape' ? editor.getShape(scene.target.shapeId) : undefined),
    [editor, scene]
  ) as CameraFrameShape | undefined
  if (!frame || frame.type !== CAMFRAME_TYPE) return null
  const setAspect = (aspect: FrameAspect) => {
    const r = ASPECTS[aspect]
    const { w, h } = frame.props
    const nh = r ? w / r : h
    editor.updateShape<CameraFrameShape>({ id: frame.id, type: CAMFRAME_TYPE, y: frame.y + (h - nh) / 2, props: { aspect, h: nh } })
  }
  const scale = (k: number) => {
    const { w, h } = frame.props
    editor.updateShape<CameraFrameShape>({
      id: frame.id, type: CAMFRAME_TYPE,
      x: frame.x - (w * k - w) / 2, y: frame.y - (h * k - h) / 2,
      props: { w: w * k, h: h * k },
    })
  }
  return (
    <>
      <h5>🎥 Marco de cámara</h5>
      <Select label="Proporción" value={frame.props.aspect}
        options={{ '16:9': '16:9 (YouTube)', '9:16': '9:16 (Shorts/Reels)', '4:3': '4:3', '1:1': '1:1', free: 'Libre' }}
        onChange={(v) => setAspect(v as FrameAspect)} />
      <div className="cb-row">
        <button className="cb-btn" onClick={() => scale(0.85)} title="Achicar la vista (más zoom)">－ Achicar</button>
        <button className="cb-btn" onClick={() => scale(1.18)} title="Agrandar la vista (menos zoom)">＋ Agrandar</button>
        <button className="cb-btn" onClick={() => { editor.select(frame.id); editor.zoomToSelection({ animation: { duration: 400 } }) }} title="Seleccionarlo para moverlo o estirarlo">✥ Editar</button>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ */

function TransitionNode(props: {
  editor: Editor
  scene: Scene
  index: number
  intro: boolean
  introDuration: number
  open: boolean
}) {
  const { editor, scene, index, intro, open } = props
  const tr = scene.transitionIn
  const meta = TRANSITIONS[tr.type]

  if (intro) {
    return (
      <div className="cb-node cb-node--intro">
        <span className="cb-node__line" />
        <span className="cb-node__chip is-muted" title="Desde la vista actual hasta la escena 1 (ajustable en Efectos)">
          ⤷ Entrada {props.introDuration.toFixed(1)}s
        </span>
        <span className="cb-node__line" />
      </div>
    )
  }

  const set = (patch: Partial<Transition>) =>
    updateScene(editor, scene.id, (s) => ({ ...s, transitionIn: { ...s.transitionIn, ...patch } }))

  return (
    <div className={`cb-node ${open ? 'is-open' : ''}`}>
      <div className="cb-node__bar">
        <span className="cb-node__line" />
        <button className="cb-node__chip" onClick={() => ui.openTransition.set(open ? null : scene.id)} title={meta.hint}>
          <span className="cb-node__icon">{meta.icon}</span> {meta.label} · {tr.type === 'cut' ? '0' : tr.duration.toFixed(1)}s
        </button>
        <span className="cb-node__line" />
      </div>
      {open && (
        <div className="cb-node__editor">
          <div className="cb-tgrid">
            {(Object.keys(TRANSITIONS) as TransitionType[]).map((t) => (
              <button key={t} className={`cb-tbtn ${tr.type === t ? 'is-on' : ''}`} onClick={() => set({ type: t })} title={TRANSITIONS[t].hint}>
                <span>{TRANSITIONS[t].icon}</span>
                {TRANSITIONS[t].label}
              </button>
            ))}
          </div>
          {tr.type !== 'cut' && (
            <>
              <Slider label="Duración" unit="s" min={0.1} max={5} step={0.05} value={tr.duration} onChange={(duration) => set({ duration })} />
              <Select label="Curva" value={tr.easing} options={EASING_LABELS} onChange={(easing) => set({ easing: easing as EasingName })} />
              {tr.type !== 'smooth' && (
                <Slider label="Intensidad" unit="%" min={0} max={100} step={1} value={Math.round(tr.intensity * 100)}
                  onChange={(v) => set({ intensity: v / 100 })} />
              )}
            </>
          )}
          <div className="cb-row">
            <button className="cb-btn" onClick={() => playerAtom.get()?.play(0, { only: index })}>▶ Probar</button>
            <button
              className="cb-btn"
              onClick={() =>
                setShow(editor, (sh) => ({ ...sh, scenes: sh.scenes.map((s) => ({ ...s, transitionIn: { ...tr } })) }))
              }
            >
              Aplicar a todas
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */

function EffectsEditor({ editor, effects, preset }: { editor: Editor; effects: ShowEffects; preset: string }) {
  const set = (fn: (e: ShowEffects) => ShowEffects) => setShow(editor, (sh) => ({ ...sh, preset: 'custom', effects: fn(sh.effects) }))
  const fx = effects
  return (
    <div className="cb-fx__body">
      <div className="cb-presets">
        {SHOW_PRESETS.map((p) => (
          <button
            key={p.id}
            className={`cb-preset ${preset === p.id ? 'is-on' : ''}`}
            title={p.description}
            onClick={() =>
              setShow(editor, (sh) => ({
                ...sh,
                preset: p.id,
                effects: { ...p.effects, reveal: p.effects.reveal, introDuration: sh.effects.introDuration, loop: sh.effects.loop, hud: sh.effects.hud },
                scenes: sh.scenes.map((s) => ({
                  ...s,
                  transitionIn: { ...p.transition },
                  entrance: p.entrance,
                  spotAnim: s.spotAnim.type === 'custom' ? s.spotAnim : { ...s.spotAnim, type: p.spot },
                  hold: p.spot === 'none' ? s.hold : Math.max(s.hold, +(s.spotAnim.duration + 0.6).toFixed(1)),
                })),
              }))
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      <h4>Barras de cine</h4>
      <Toggle label="Activar" value={fx.letterbox.enabled} onChange={(enabled) => set((e) => ({ ...e, letterbox: { ...e.letterbox, enabled } }))} />
      {fx.letterbox.enabled && (
        <>
          <Slider label="Altura" unit="%" min={2} max={20} step={0.5} value={fx.letterbox.height * 100}
            onChange={(v) => set((e) => ({ ...e, letterbox: { ...e.letterbox, height: v / 100 } }))} />
          <Slider label="Opacidad" unit="%" min={10} max={100} step={1} value={fx.letterbox.opacity * 100}
            onChange={(v) => set((e) => ({ ...e, letterbox: { ...e.letterbox, opacity: v / 100 } }))} />
        </>
      )}

      <h4>Luz de detective</h4>
      <Toggle label="Linterna sobre el objeto" value={fx.spotlight.enabled} onChange={(enabled) => set((e) => ({ ...e, spotlight: { ...e.spotlight, enabled } }))} />
      <Slider label="Tamaño del haz" unit="×" min={0.8} max={3} step={0.05} value={fx.spotlight.size}
        onChange={(size) => set((e) => ({ ...e, spotlight: { ...e.spotlight, size } }))} />
      <Slider label="Suavidad" unit="%" min={0} max={100} step={1} value={fx.spotlight.softness * 100}
        onChange={(v) => set((e) => ({ ...e, spotlight: { ...e.spotlight, softness: v / 100 } }))} />
      <Slider label="Oscuridad" unit="%" min={0} max={98} step={1} value={fx.spotlight.dim * 100}
        onChange={(v) => set((e) => ({ ...e, spotlight: { ...e.spotlight, dim: v / 100 } }))} />
      <Select label="Forma" value={fx.spotlight.shape} options={{ ellipse: 'Elipse (sigue al objeto)', circle: 'Círculo' }}
        onChange={(shape) => set((e) => ({ ...e, spotlight: { ...e.spotlight, shape: shape as any } }))} />
      <Toggle label="Parpadeo" value={fx.spotlight.flicker} onChange={(flicker) => set((e) => ({ ...e, spotlight: { ...e.spotlight, flicker } }))} />
      <Toggle label="Luz cálida" value={fx.spotlight.warm} onChange={(warm) => set((e) => ({ ...e, spotlight: { ...e.spotlight, warm } }))} />

      <h4>Imagen</h4>
      <Select label="Color" value={fx.grade}
        options={{ none: 'Natural', noir: 'Noir (B/N)', sepia: 'Sepia', warm: 'Cálido', cold: 'Frío', vivid: 'Vivo' }}
        onChange={(grade) => set((e) => ({ ...e, grade: grade as any }))} />
      <Toggle label="Viñeta" value={fx.vignette.enabled} onChange={(enabled) => set((e) => ({ ...e, vignette: { ...e.vignette, enabled } }))} />
      {fx.vignette.enabled && (
        <Slider label="Viñeta" unit="%" min={0} max={100} step={1} value={fx.vignette.amount * 100}
          onChange={(v) => set((e) => ({ ...e, vignette: { ...e.vignette, amount: v / 100 } }))} />
      )}
      <Toggle label="Grano de película" value={fx.grain.enabled} onChange={(enabled) => set((e) => ({ ...e, grain: { ...e.grain, enabled } }))} />
      {fx.grain.enabled && (
        <Slider label="Grano" unit="%" min={0} max={50} step={1} value={fx.grain.amount * 100}
          onChange={(v) => set((e) => ({ ...e, grain: { ...e.grain, amount: v / 100 } }))} />
      )}

      <h4>Aparición de objetos</h4>
      <Toggle label="Ocultar cada objeto hasta su escena" value={fx.reveal} onChange={(reveal) => set((e) => ({ ...e, reveal }))} />
      <div className="cb-row cb-row--wrap">
        {(Object.keys(ENTRANCES) as EntranceType[]).map((k) => (
          <button key={k} className="cb-chip" title={`Aplicar «${ENTRANCES[k].label}» a todas las escenas`}
            onClick={() => setShow(editor, (sh) => ({ ...sh, scenes: sh.scenes.map((s) => ({ ...s, entrance: k })) }))}>
            {ENTRANCES[k].icon} {ENTRANCES[k].label}
          </button>
        ))}
      </div>
      <h4>Linterna en todas las escenas</h4>
      <div className="cb-row cb-row--wrap">
        {(Object.keys(SPOT_ANIMS) as SpotAnimType[]).filter((k) => k !== 'custom').map((k) => (
          <button key={k} className="cb-chip" title={SPOT_ANIMS[k].hint}
            onClick={() => setShow(editor, (sh) => ({
              ...sh,
              effects: k === 'none' ? sh.effects : { ...sh.effects, spotlight: { ...sh.effects.spotlight, enabled: true } },
              scenes: sh.scenes.map((s) => ({
                ...s,
                spotAnim: { ...s.spotAnim, type: k },
                hold: k === 'none' ? s.hold : Math.max(s.hold, +(s.spotAnim.duration + 0.6).toFixed(1)),
              })),
            }))}>
            {SPOT_ANIMS[k].icon} {SPOT_ANIMS[k].label}
          </button>
        ))}
      </div>

      <h4>Reproducción</h4>
      <Slider label="Entrada" unit="s" min={0} max={4} step={0.1} value={fx.introDuration}
        onChange={(introDuration) => set((e) => ({ ...e, introDuration }))} />
      <Toggle label="Ocultar controles solos" value={fx.hud.autoHide} onChange={(autoHide) => set((e) => ({ ...e, hud: { autoHide } }))} />
      <Toggle label="Repetir en bucle" value={fx.loop} onChange={(loop) => set((e) => ({ ...e, loop }))} />
    </div>
  )
}

/* ---------------------------- controles ---------------------------- */

export function Slider(p: { label: string; unit?: string; min: number; max: number; step: number; value: number; onChange(v: number): void }) {
  return (
    <label className="cb-field">
      <span>{p.label}</span>
      <input type="range" min={p.min} max={p.max} step={p.step} value={p.value} onChange={(e) => p.onChange(+e.target.value)} />
      <em>{Number.isInteger(p.step) ? Math.round(p.value) : p.value.toFixed(p.step < 0.1 ? 2 : 1)}{p.unit}</em>
    </label>
  )
}

export function Toggle(p: { label: string; value: boolean; onChange(v: boolean): void }) {
  return (
    <label className="cb-field cb-field--toggle">
      <span>{p.label}</span>
      <input type="checkbox" checked={p.value} onChange={(e) => p.onChange(e.target.checked)} />
      <i className="cb-switch" />
    </label>
  )
}

export function Select(p: { label: string; value: string; options: Record<string, string>; onChange(v: string): void }) {
  return (
    <label className="cb-field">
      <span>{p.label}</span>
      <select value={p.value} onChange={(e) => p.onChange(e.target.value)}>
        {Object.entries(p.options).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>
    </label>
  )
}
