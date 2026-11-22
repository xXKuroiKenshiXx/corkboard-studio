/**
 * Guardar / abrir tableros como JSON.
 * El snapshot de tldraw incluye document.meta, así que el fondo, las escenas
 * y los efectos viajan dentro del mismo archivo. Las imágenes se guardan
 * embebidas (base64) gracias a `inlineBase64AssetStore`.
 */
import { Editor, getSnapshot, loadSnapshot } from 'tldraw'

export function exportBoard(editor: Editor) {
  const data = {
    app: 'corkboard-studio',
    version: 1,
    savedAt: new Date().toISOString(),
    snapshot: getSnapshot(editor.store),
  }
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
  const a = document.createElement('a')
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
  a.href = URL.createObjectURL(blob)
  a.download = `tablero-${stamp}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

export async function importBoard(editor: Editor, file: File) {
  try {
    const json = JSON.parse(await file.text())
    const snap = json.snapshot ?? json
    if (!confirm('¿Reemplazar el tablero actual por el archivo? (Guardá antes si querés conservarlo)')) return
    loadSnapshot(editor.store, snap)
    editor.zoomToFit({ animation: { duration: 300 } })
  } catch (err) {
    console.error(err)
    alert('No se pudo abrir el archivo: no parece un tablero válido.')
  }
}
