/**
 * Grabación del Modo Reproducción a video.
 *
 * Usa la API de captura de pestaña del navegador (getDisplayMedia con
 * `preferCurrentTab`). En Chrome/Edge además recortamos la captura al área
 * del tablero con Region Capture (`CropTarget`), así no aparecen pestañas,
 * barras ni nada fuera del lienzo. El navegador siempre pide permiso: elegí
 * “Esta pestaña”.
 *
 * Formato: MP4 (H.264) si el navegador lo soporta (Chrome ≥ 126), si no WebM.
 */
export interface Recording {
  blob: Blob
  url: string
  mime: string
  ext: 'mp4' | 'webm'
}

const CANDIDATES = [
  'video/mp4;codecs=avc1.640033',
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
]

export class TabRecorder {
  private stream: MediaStream | null = null
  private rec: MediaRecorder | null = null
  private chunks: Blob[] = []
  private mime = 'video/webm'

  static isSupported() {
    return !!navigator.mediaDevices?.getDisplayMedia && typeof MediaRecorder !== 'undefined'
  }

  /** Pide permiso y prepara la captura (no empieza a grabar todavía). */
  async prepare(cropTo: HTMLElement, fps = 60) {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: fps, max: fps }, displaySurface: 'browser' } as any,
      audio: false,
      // @ts-expect-error opciones nuevas de Chrome
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
      surfaceSwitching: 'exclude',
    })
    const track = stream.getVideoTracks()[0]
    const w = window as any
    try {
      if (w.RestrictionTarget && (track as any).restrictTo) {
        const target = await w.RestrictionTarget.fromElement(cropTo)
        await (track as any).restrictTo(target)
      } else if (w.CropTarget && (track as any).cropTo) {
        const target = await w.CropTarget.fromElement(cropTo)
        await (track as any).cropTo(target)
      }
    } catch (err) {
      console.warn('[recorder] no se pudo recortar al tablero, se graba la pestaña completa', err)
    }
    this.stream = stream
    this.mime = CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? 'video/webm'
    return stream
  }

  start() {
    if (!this.stream) throw new Error('prepare() primero')
    this.chunks = []
    this.rec = new MediaRecorder(this.stream, { mimeType: this.mime, videoBitsPerSecond: 16_000_000 })
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data)
    this.rec.start(250)
  }

  /** Si el usuario corta la captura desde el navegador. */
  onEnded(cb: () => void) {
    this.stream?.getVideoTracks()[0]?.addEventListener('ended', cb)
  }

  async stop(): Promise<Recording | null> {
    const rec = this.rec
    if (!rec) {
      this.release()
      return null
    }
    const done = new Promise<void>((res) => (rec.onstop = () => res()))
    if (rec.state !== 'inactive') rec.stop()
    await done
    this.release()
    const blob = new Blob(this.chunks, { type: this.mime.split(';')[0] })
    return {
      blob,
      url: URL.createObjectURL(blob),
      mime: this.mime,
      ext: this.mime.startsWith('video/mp4') ? 'mp4' : 'webm',
    }
  }

  release() {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.rec = null
  }
}
