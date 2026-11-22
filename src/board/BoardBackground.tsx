import { useEditor, useValue } from 'tldraw'
import { getBoard } from './settings'
import { getTexture, TILE } from './textures'

/**
 * Reemplaza el fondo de tldraw. La textura vive en “coordenadas de mundo”:
 * al hacer zoom/paneo solo recalculamos posición y tamaño del patrón,
 * así se escala y desplaza junto con el contenido sin costo extra.
 */
export function BoardBackground() {
  const editor = useEditor()
  const bg = useValue('board-bg', () => getBoard(editor).background, [editor])
  const cam = useValue('camera', () => editor.getCamera(), [editor])

  const texture = getTexture(bg.kind, bg.color)
  const z = cam.z
  // el tile mide TILE px “de mundo”: escala 1:1 con el zoom, igual que las notas
  const tileWorld = TILE * bg.scale
  const size = tileWorld * z

  let backgroundImage = texture ? `url(${texture})` : 'none'
  let backgroundSize = `${size}px ${size}px`
  let backgroundPosition = `${cam.x * z}px ${cam.y * z}px`
  let backgroundRepeat = 'repeat'

  const safeImage = safeImageUrl(bg.imageUrl)
  if (bg.kind === 'image' && safeImage) {
    backgroundImage = `url(${JSON.stringify(safeImage)})`
    if (bg.imageMode === 'screen') {
      backgroundSize = 'cover'
      backgroundPosition = 'center'
      backgroundRepeat = 'no-repeat'
    } else {
      backgroundSize = `${1600 * bg.scale * z}px auto`
    }
  }

  return (
    <div className="cb-background" style={{ backgroundColor: bg.color }}>
      <div
        className="cb-background__texture"
        style={{ backgroundImage, backgroundSize, backgroundPosition, backgroundRepeat }}
      />
      {bg.vignette > 0 && (
        <div
          className="cb-background__vignette"
          style={{
            background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(20,10,0,${bg.vignette}) 100%)`,
          }}
        />
      )}
    </div>
  )
}

/**
 * Solo aceptamos imágenes embebidas (data:image/…) o https. Un tablero
 * importado de otra persona no puede meter CSS ni URLs raras en el fondo.
 */
function safeImageUrl(url?: string) {
  if (!url) return null
  if (/^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml);base64,[a-z0-9+/=\s]+$/i.test(url)) return url
  if (/^https:\/\/[^\s"'()\\]+$/i.test(url)) return url
  return null
}
