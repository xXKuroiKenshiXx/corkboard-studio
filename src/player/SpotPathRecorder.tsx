/**
 * GRABAR EL RECORRIDO DE LA LINTERNA “A MANO”
 *
 * 1. La cámara encuadra la escena tal como se verá en la reproducción.
 * 2. Mantené apretado el mouse y mové la linterna: se graba el recorrido
 *    (posición + tiempo real) relativo al objeto.
 * 3. Al soltar, la escena queda con la animación “A mano”. Si después movés
 *    o agrandás el objeto, el recorrido lo acompaña (está guardado en
 *    unidades del objeto, no en píxeles).
 */
import { useEffect, useRef, useState } from 'react'
import { Editor, useValue } from 'tldraw'
import { getShow } from '../board/settings'
import { playerAtom, ui, updateScene } from '../ui/uiState'

export function SpotPathRecorder({ editor }: { editor: Editor }) {
  const sceneId = useValue(ui.spotRecording)
  const scene = useValue('rec-scene', () => getShow(editor).scenes.find((s) => s.id === sceneId) ?? null, [editor, sceneId])
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null)
  const [recording, setRecording] = useState(false)
  const points = useRef<[number, number, number][]>([])
  const startT = useRef(0)
  const [trail, setTrail] = useState<{ x: number; y: number }[]>([])

  // encuadrar la escena al empezar
  useEffect(() => {
    if (!scene) return
    const p = playerAtom.get()
    const b = p?.sceneBounds(scene)
    if (!p || !b) return
    const cam = p.fit(scene, b)
    const vp = editor.getViewportScreenBounds()
    editor.setCamera({ x: vp.w / (2 * cam.z) - cam.cx, y: vp.h / (2 * cam.z) - cam.cy, z: cam.z }, { animation: { duration: 500 } })
    editor.selectNone()
    setTrail([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneId])

  useEffect(() => {
    if (!sceneId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        ui.spotRecording.set(null)
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [sceneId])

  if (!scene) return null
  const b = playerAtom.get()?.sceneBounds(scene)
  if (!b) return null

  const zoom = editor.getZoomLevel()
  const center = editor.pageToViewport(b.center)
  const rx = (b.w / 2) * zoom * 0.55
  const ry = (b.h / 2) * zoom * 0.55
  const rect = () => editor.getContainer().getBoundingClientRect()

  const toRel = (clientX: number, clientY: number) => {
    const page = editor.screenToPage({ x: clientX, y: clientY })
    return [(page.x - b.center.x) / b.w, (page.y - b.center.y) / b.h] as const
  }

  const finish = () => {
    setRecording(false)
    const pts = points.current
    if (pts.length < 3) return
    const dur = pts[pts.length - 1][0]
    updateScene(editor, scene.id, (s) => ({
      ...s,
      spotAnim: { ...s.spotAnim, type: 'custom', path: pts, duration: +(Math.max(0.8, dur / 0.85)).toFixed(2) },
      hold: Math.max(s.hold, +(dur / 0.85 + 0.6).toFixed(1)),
      spotlight: s.spotlight === 'off' ? 'on' : s.spotlight,
    }))
    ui.spotRecording.set(null)
  }

  const spot = mouse ?? { x: center.x, y: center.y - ry * 3 }

  return (
    <div
      className="cb-spotrec"
      onPointerMove={(e) => {
        const r = rect()
        setMouse({ x: e.clientX - r.left, y: e.clientY - r.top })
        if (recording) {
          const [x, y] = toRel(e.clientX, e.clientY)
          const t = (performance.now() - startT.current) / 1000
          const last = points.current[points.current.length - 1]
          if (!last || t - last[0] > 1 / 40) {
            points.current.push([+t.toFixed(3), +x.toFixed(4), +y.toFixed(4)])
            setTrail((tr) => [...tr, { x: e.clientX - r.left, y: e.clientY - r.top }])
          }
        }
      }}
      onPointerDown={(e) => {
        e.stopPropagation()
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        points.current = []
        setTrail([])
        startT.current = performance.now()
        const [x, y] = toRel(e.clientX, e.clientY)
        points.current.push([0, +x.toFixed(4), +y.toFixed(4)])
        setRecording(true)
      }}
      onPointerUp={() => recording && finish()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className="cb-overlay__layer"
        style={{
          background: `radial-gradient(${rx}px ${ry}px at ${spot.x}px ${spot.y}px, rgba(255,226,170,.12) 0%, rgba(0,0,0,0) 70%, rgba(4,4,10,.8) 100%)`,
        }}
      />
      <svg className="cb-spotrec__svg">
        <ellipse cx={center.x} cy={center.y} rx={(b.w / 2) * zoom} ry={(b.h / 2) * zoom} className="cb-spotrec__target" />
        {trail.length > 1 && (
          <polyline points={trail.map((p) => `${p.x},${p.y}`).join(' ')} className="cb-spotrec__trail" />
        )}
      </svg>
      <div className="cb-spotrec__hint">
        {recording ? (
          <>🔴 Grabando recorrido… <b>soltá</b> para terminar</>
        ) : (
          <>
            🔦 <b>Mantené apretado</b> el mouse y mové la linterna como quieras que llegue a «{scene.label}». Al final se
            centra sola. <kbd>Esc</kbd> cancela.
          </>
        )}
      </div>
    </div>
  )
}
