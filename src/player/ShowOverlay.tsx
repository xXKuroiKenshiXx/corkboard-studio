import { useEffect, useMemo, useRef, useState } from 'react'
import { Editor, useValue } from 'tldraw'
import { getShow } from '../board/settings'
import { getGrainTexture } from '../board/textures'
import { playerAtom, ui } from '../ui/uiState'

/**
 * Capa de efectos que va ENCIMA del lienzo (fuera de tldraw):
 * barras de cine, linterna/spotlight, viñeta, grano, glitch, fundido,
 * cuenta regresiva de grabación y la “linterna libre” (J) en edición.
 */
export function ShowOverlay({ editor }: { editor: Editor }) {
  const player = useValue(playerAtom)
  const status = useValue('status', () => player?.status.get() ?? 'idle', [player])
  const fx = useValue('fx', () => player?.fx.get(), [player])
  const effects = useValue('effects', () => getShow(editor).effects, [editor])
  const countdown = useValue(ui.countdown)
  const flashlight = useValue(ui.flashlight)
  const active = status !== 'idle'

  // linterna libre: sigue al mouse fuera del modo reproducción
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => {
    if (!flashlight || active) return
    const onMove = (e: PointerEvent) => {
      const r = editor.getContainer().getBoundingClientRect()
      setMouse({ x: e.clientX - r.left, y: e.clientY - r.top })
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [flashlight, active, editor])

  const grain = useMemo(() => getGrainTexture(), [])
  const grainRef = useRef<HTMLDivElement>(null)

  // spotlight a dibujar (reproducción o linterna libre)
  let spot: { x: number; y: number; rx: number; ry: number } | null = null
  let spotAlpha = 0
  const sp = effects.spotlight
  if (active && fx?.spot) {
    spot = fx.spot
    spotAlpha = fx.spotAlpha
  } else if (!active && flashlight && mouse) {
    spot = { x: mouse.x, y: mouse.y, rx: 190, ry: 190 }
    spotAlpha = 1
  }

  const flicker = active && sp.flicker ? 0.94 + Math.random() * 0.06 : 1
  const dim = (active ? sp.dim : 0.78) * spotAlpha * flicker
  const inner = Math.round((1 - (active ? sp.softness : 0.45)) * 100)

  if (grainRef.current) {
    grainRef.current.style.backgroundPosition = `${(Math.random() * 256) | 0}px ${(Math.random() * 256) | 0}px`
  }

  const lb = active && effects.letterbox.enabled ? effects.letterbox.height * (fx?.letterbox ?? 0) : 0
  const glitch = fx?.glitch ?? 0

  return (
    <div className="cb-overlay" data-active={active}>
      {/* filtro SVG para el barrido direccional (whip pan) */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
        <filter id="cb-whip" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur id="cb-whip-blur" stdDeviation="0 0" />
        </filter>
      </svg>

      {spot && dim > 0.005 && (
        <>
          <div
            className="cb-overlay__layer"
            style={{
              background: `radial-gradient(${spot.rx}px ${spot.ry}px at ${spot.x}px ${spot.y}px, rgba(0,0,0,0) ${inner}%, rgba(4,4,10,${dim}) 100%)`,
            }}
          />
          {(active ? sp.warm : true) && (
            <div
              className="cb-overlay__layer"
              style={{
                mixBlendMode: 'soft-light',
                background: `radial-gradient(${spot.rx}px ${spot.ry}px at ${spot.x}px ${spot.y}px, rgba(255,214,140,${0.55 * spotAlpha}) 0%, rgba(255,214,140,0) 85%)`,
              }}
            />
          )}
        </>
      )}

      {active && effects.vignette.enabled && (
        <div
          className="cb-overlay__layer"
          style={{ background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 50%, rgba(0,0,0,${effects.vignette.amount}) 100%)` }}
        />
      )}

      {active && effects.grain.enabled && (
        <div
          ref={grainRef}
          className="cb-overlay__layer cb-overlay__grain"
          style={{ backgroundImage: `url(${grain})`, opacity: effects.grain.amount }}
        />
      )}

      {glitch > 0.05 && <GlitchSlices amount={glitch} />}

      {active && (fx?.fade ?? 0) > 0.001 && <div className="cb-overlay__layer" style={{ background: '#000', opacity: fx!.fade }} />}

      {lb > 0 && (
        <>
          <div className="cb-letterbox cb-letterbox--top" style={{ height: `${lb * 100}%`, opacity: effects.letterbox.opacity }} />
          <div className="cb-letterbox cb-letterbox--bottom" style={{ height: `${lb * 100}%`, opacity: effects.letterbox.opacity }} />
        </>
      )}

      {countdown > 0 && (
        <div className="cb-countdown">
          <div key={countdown} className="cb-countdown__n">{countdown}</div>
          <div className="cb-countdown__hint">Grabando en…</div>
        </div>
      )}
    </div>
  )
}

function GlitchSlices({ amount }: { amount: number }) {
  const n = 7
  return (
    <>
      {Array.from({ length: n }).map((_, i) => {
        if (Math.random() > amount + 0.15) return null
        const top = Math.random() * 100
        const h = 1 + Math.random() * 9 * amount
        const dx = (Math.random() - 0.5) * 80 * amount
        const hue = (Math.random() * 360) | 0
        return (
          <div
            key={i}
            className="cb-glitch-slice"
            style={{
              top: `${top}%`,
              height: `${h}%`,
              transform: `translateX(${dx}px)`,
              backdropFilter: `hue-rotate(${hue}deg) saturate(3) contrast(1.4) ${Math.random() > 0.7 ? 'invert(1)' : ''}`,
            }}
          />
        )
      })}
      <div className="cb-overlay__layer cb-glitch-scan" style={{ opacity: amount * 0.6 }} />
    </>
  )
}
