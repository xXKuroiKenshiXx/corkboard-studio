import { useValue } from 'tldraw'
import { ui } from './uiState'

/** Se abre al terminar una grabación: vista previa + descarga. */
export function RecordingModal() {
  const rec = useValue(ui.recording)
  if (!rec) return null
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
  const name = `corkboard-${stamp}.${rec.ext}`
  const close = () => {
    URL.revokeObjectURL(rec.url)
    ui.recording.set(null)
  }
  return (
    <div className="cb-modal" onPointerDown={(e) => e.stopPropagation()}>
      <div className="cb-modal__card">
        <header className="cb-panel__head">
          <span>🎞 Tu video está listo</span>
          <button className="cb-icon" onClick={close}>✕</button>
        </header>
        <video src={rec.url} controls autoPlay muted playsInline />
        <div className="cb-row">
          <a className="cb-btn cb-btn--primary" href={rec.url} download={name}>⬇ Descargar {rec.ext.toUpperCase()}</a>
          <span className="cb-modal__meta">{(rec.blob.size / 1024 / 1024).toFixed(1)} MB</span>
          <button className="cb-btn" onClick={close}>Cerrar</button>
        </div>
        {rec.ext === 'webm' && (
          <p className="cb-modal__hint">
            WebM se abre en Chrome, VLC, DaVinci Resolve y YouTube lo acepta directo. Para MP4 usá Chrome/Edge actualizado.
          </p>
        )}
      </div>
    </div>
  )
}
