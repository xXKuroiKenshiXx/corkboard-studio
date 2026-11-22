import { useEffect, useRef, useState } from 'react'
import { Editor, useValue } from 'tldraw'
import { getShow } from '../board/settings'
import { playerAtom } from '../ui/uiState'

const fmt = (s: number) => {
  const m = Math.floor(s / 60)
  const r = s - m * 60
  return `${m}:${r.toFixed(1).padStart(4, '0')}`
}

/**
 * Controles durante la reproducción:
 *  - barra de tiempo ARRASTRABLE con una marca por escena (clic para saltar)
 *  - ⏮ ⏯ ⏭ ⏹ y pantalla completa
 *  - atrapa el mouse para no editar el tablero sin querer
 *  - se ocultan solos tras 2 s sin mover el mouse; nunca aparecen al grabar
 */
export function PlayerControls({ editor }: { editor: Editor }) {
  const player = useValue(playerAtom)
  const status = useValue('status', () => player?.status.get() ?? 'idle', [player])
  const index = useValue('index', () => player?.index.get() ?? 0, [player])
  const t = useValue('t', () => player?.fx.get().t ?? 0, [player])
  const timeline = useValue('timeline', () => player?.timeline.get() ?? { total: 0, marks: [] }, [player])
  const recording = useValue('rec', () => player?.recording.get() ?? false, [player])
  const autoHide = useValue('autohide', () => getShow(editor).effects.hud.autoHide, [editor])

  const [visible, setVisible] = useState(true)
  const [hover, setHover] = useState<number | null>(null)
  const [scrubbing, setScrubbing] = useState(false)
  const timer = useRef<number>(0)
  const barRef = useRef<HTMLDivElement>(null)
  const wasPlaying = useRef(false)

  const poke = () => {
    setVisible(true)
    window.clearTimeout(timer.current)
    if (autoHide) timer.current = window.setTimeout(() => setVisible(false), 2200)
  }
  useEffect(() => {
    if (status !== 'idle') poke()
    return () => window.clearTimeout(timer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, autoHide])

  if (status === 'idle' || !player) return null

  const total = timeline.total || 1
  const timeAt = (clientX: number) => {
    const r = barRef.current!.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * total
  }

  const onScrubDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    wasPlaying.current = player.status.get() === 'playing'
    player.pause()
    setScrubbing(true)
    player.seek(timeAt(e.clientX))
  }
  const onScrubMove = (e: React.PointerEvent) => {
    setHover(timeAt(e.clientX))
    if (scrubbing) player.seek(timeAt(e.clientX))
  }
  const onScrubUp = () => {
    if (!scrubbing) return
    setScrubbing(false)
    if (wasPlaying.current) player.resume()
  }

  const keepOpen = visible || scrubbing

  return (
    <div
      className="cb-catcher"
      data-hidecursor={!keepOpen || recording}
      onPointerMove={poke}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {!recording && (
        <div className={`cb-player ${keepOpen ? '' : 'is-hidden'}`} onPointerEnter={poke}>
          <div
            ref={barRef}
            className={`cb-scrub ${scrubbing ? 'is-scrubbing' : ''}`}
            onPointerDown={onScrubDown}
            onPointerMove={onScrubMove}
            onPointerUp={onScrubUp}
            onPointerLeave={() => setHover(null)}
          >
            <div className="cb-scrub__track">
              <div className="cb-scrub__fill" style={{ width: `${(t / total) * 100}%` }} />
            </div>
            {timeline.marks.map((m) => (
              <button
                key={m.index}
                className={`cb-scrub__mark ${m.index === index ? 'is-on' : ''}`}
                style={{ left: `${(m.t / total) * 100}%` }}
                title={`${m.index + 1}. ${m.label}`}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  player.seek(m.t)
                }}
              >
                {m.index + 1}
              </button>
            ))}
            <div className="cb-scrub__head" style={{ left: `${(t / total) * 100}%` }} />
            {hover !== null && (
              <div className="cb-scrub__tip" style={{ left: `${(hover / total) * 100}%` }}>
                {fmt(hover)}
              </div>
            )}
          </div>
          <div className="cb-player__row">
            <button onClick={() => player.prev()} title="Anterior (←)">⏮</button>
            <button className="cb-player__main" onClick={() => player.toggle()} title="Pausa / seguir (Espacio)">
              {status === 'playing' ? '❚❚' : '▶'}
            </button>
            <button onClick={() => player.next()} title="Siguiente (→)">⏭</button>
            <button onClick={() => player.stop()} title="Salir (Esc)">⏹</button>
            <div className="cb-player__info">
              <b>
                {index + 1} / {timeline.marks.length} · <span className="cb-mono">{fmt(t)} / {fmt(timeline.total)}</span>
              </b>
              <span>{timeline.marks[index]?.label}</span>
            </div>
            <button
              onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())}
              title="Pantalla completa (F)"
            >
              ⛶
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
