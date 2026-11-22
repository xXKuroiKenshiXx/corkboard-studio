/**
 * Generador procedural de texturas “tileables” (se repiten sin costura).
 * Se generan una sola vez en un <canvas> y se cachean como dataURL,
 * así el fondo se mueve con la cámara a 60 fps solo cambiando
 * `background-position` y `background-size` (barato para la GPU).
 */
import type { BackgroundKind } from './settings'

export const TILE = 512
const cache = new Map<string, string>()

function hexToRgb(hex: string) {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const clamp = (v: number) => Math.max(0, Math.min(255, v))
const rgba = (r: number, g: number, b: number, a: number) => `rgba(${clamp(r) | 0},${clamp(g) | 0},${clamp(b) | 0},${a})`

/** Dibuja `fn` repetido en las 9 posiciones vecinas para que el tile no tenga costuras. */
function wrapped(ctx: CanvasRenderingContext2D, x: number, y: number, fn: (x: number, y: number) => void, reach = 12) {
  // `reach` = cuánto se extiende el trazo desde su centro: las copias vecinas
  // que alcanzan el tile también se dibujan → bordes sin costura
  for (const dx of [-TILE, 0, TILE]) for (const dy of [-TILE, 0, TILE]) {
    const px = x + dx
    const py = y + dy
    if (px > -reach && px < TILE + reach && py > -reach && py < TILE + reach) fn(px, py)
  }
}

function pixelNoise(ctx: CanvasRenderingContext2D, amount: number, rand: () => number) {
  const img = ctx.getImageData(0, 0, TILE, TILE)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * amount
    d[i] = clamp(d[i] + n)
    d[i + 1] = clamp(d[i + 1] + n)
    d[i + 2] = clamp(d[i + 2] + n)
  }
  ctx.putImageData(img, 0, 0)
}

function cork(ctx: CanvasRenderingContext2D, hex: string) {
  const { r, g, b } = hexToRgb(hex)
  const rand = rng(1337)
  ctx.fillStyle = rgba(r, g, b, 1)
  ctx.fillRect(0, 0, TILE, TILE)

  // 1) manchas grandes y suaves (variación de tono)
  for (let i = 0; i < 70; i++) {
    const x = rand() * TILE
    const y = rand() * TILE
    const rad = 30 + rand() * 70
    const k = (rand() - 0.5) * 34
    wrapped(ctx, x, y, (px, py) => {
      const grd = ctx.createRadialGradient(px, py, 0, px, py, rad)
      grd.addColorStop(0, rgba(r + k, g + k * 0.8, b + k * 0.6, 0.35))
      grd.addColorStop(1, rgba(r + k, g + k, b + k, 0))
      ctx.fillStyle = grd
      ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2)
    }, rad)
  }
  // 2) gránulos de corcho (miles de pequeñas elipses claras/oscuras)
  for (let i = 0; i < 9000; i++) {
    const x = rand() * TILE
    const y = rand() * TILE
    const rx = 0.6 + rand() * 2.6
    const ry = rx * (0.5 + rand() * 0.7)
    const rot = rand() * Math.PI
    const dark = rand() < 0.55
    const k = dark ? -(25 + rand() * 55) : 18 + rand() * 40
    const a = 0.25 + rand() * 0.45
    wrapped(ctx, x, y, (px, py) => {
      ctx.fillStyle = rgba(r + k, g + k * 0.9, b + k * 0.75, a)
      ctx.beginPath()
      ctx.ellipse(px, py, rx, ry, rot, 0, Math.PI * 2)
      ctx.fill()
    })
  }
  // 3) poros oscuros
  for (let i = 0; i < 500; i++) {
    const x = rand() * TILE
    const y = rand() * TILE
    const rad = 0.8 + rand() * 1.8
    wrapped(ctx, x, y, (px, py) => {
      ctx.fillStyle = rgba(r * 0.35, g * 0.3, b * 0.25, 0.55)
      ctx.beginPath()
      ctx.arc(px, py, rad, 0, Math.PI * 2)
      ctx.fill()
    })
  }
  pixelNoise(ctx, 22, rand)
}

function felt(ctx: CanvasRenderingContext2D, hex: string) {
  const { r, g, b } = hexToRgb(hex)
  const rand = rng(77)
  ctx.fillStyle = rgba(r, g, b, 1)
  ctx.fillRect(0, 0, TILE, TILE)
  for (let i = 0; i < 14000; i++) {
    const x = rand() * TILE
    const y = rand() * TILE
    const len = 2 + rand() * 6
    const ang = rand() * Math.PI * 2
    const k = (rand() - 0.5) * 50
    wrapped(ctx, x, y, (px, py) => {
      ctx.strokeStyle = rgba(r + k, g + k, b + k, 0.35)
      ctx.lineWidth = 0.6
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len)
      ctx.stroke()
    })
  }
  pixelNoise(ctx, 14, rand)
}

function chalk(ctx: CanvasRenderingContext2D, hex: string) {
  const { r, g, b } = hexToRgb(hex)
  const rand = rng(9)
  ctx.fillStyle = rgba(r, g, b, 1)
  ctx.fillRect(0, 0, TILE, TILE)
  // restos de tiza borrada
  for (let i = 0; i < 40; i++) {
    const x = rand() * TILE
    const y = rand() * TILE
    const w = 60 + rand() * 160
    wrapped(ctx, x, y, (px, py) => {
      const grd = ctx.createRadialGradient(px, py, 0, px, py, w)
      grd.addColorStop(0, 'rgba(255,255,255,0.045)')
      grd.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = grd
      ctx.fillRect(px - w, py - w, w * 2, w * 2)
    }, w)
  }
  pixelNoise(ctx, 18, rand)
}

function paper(ctx: CanvasRenderingContext2D, hex: string) {
  const { r, g, b } = hexToRgb(hex)
  const rand = rng(3)
  ctx.fillStyle = rgba(r, g, b, 1)
  ctx.fillRect(0, 0, TILE, TILE)
  for (let i = 0; i < 2500; i++) {
    const x = rand() * TILE
    const y = rand() * TILE
    const len = 3 + rand() * 10
    const ang = rand() * Math.PI
    wrapped(ctx, x, y, (px, py) => {
      ctx.strokeStyle = rgba(r - 30, g - 30, b - 35, 0.12)
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len)
      ctx.stroke()
    })
  }
  pixelNoise(ctx, 10, rand)
}

function isDark(hex: string) {
  const { r, g, b } = hexToRgb(hex)
  return r * 0.299 + g * 0.587 + b * 0.114 < 128
}

function grid(ctx: CanvasRenderingContext2D, hex: string) {
  ctx.fillStyle = hex
  ctx.fillRect(0, 0, TILE, TILE)
  const line = isDark(hex) ? 'rgba(255,255,255,' : 'rgba(0,0,0,'
  for (let i = 0; i <= TILE; i += 32) {
    const major = i % 128 === 0
    ctx.strokeStyle = line + (major ? '0.16)' : '0.07)')
    ctx.lineWidth = major ? 1.5 : 1
    ctx.beginPath(); ctx.moveTo(i + 0.5, 0); ctx.lineTo(i + 0.5, TILE); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, i + 0.5); ctx.lineTo(TILE, i + 0.5); ctx.stroke()
  }
}

function dots(ctx: CanvasRenderingContext2D, hex: string) {
  ctx.fillStyle = hex
  ctx.fillRect(0, 0, TILE, TILE)
  ctx.fillStyle = isDark(hex) ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)'
  for (let x = 16; x < TILE; x += 32) for (let y = 16; y < TILE; y += 32) {
    ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill()
  }
}

export function getTexture(kind: BackgroundKind, color: string): string | null {
  if (kind === 'solid' || kind === 'image') return null
  const key = `${kind}:${color}`
  const hit = cache.get(key)
  if (hit) return hit
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = TILE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ;({ cork, felt, chalk, paper, grid, dots } as Record<string, (c: CanvasRenderingContext2D, h: string) => void>)[kind](ctx, color)
  const url = canvas.toDataURL('image/jpeg', 0.9)
  cache.set(key, url)
  return url
}

/** Ruido para el efecto “grano de película” del modo reproducción. */
export function getGrainTexture(): string {
  const hit = cache.get('grain')
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(256, 256)
  const rand = rng(42)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = rand() * 255
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v
    img.data[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  const url = c.toDataURL('image/png')
  cache.set('grain', url)
  return url
}
