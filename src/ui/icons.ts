/** Íconos de la barra de herramientas (tldraw los usa como máscara monocromo). */
const svg = (body: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
  )}`

export const ICONS: Record<string, string> = {
  'tool-pin': svg(
    '<circle cx="15" cy="10" r="5.5" fill="black"/><path d="M15 15.5 L15 25"/><path d="M11 25 h8" stroke-width="1.5"/>'
  ),
  'tool-string': svg(
    '<circle cx="7" cy="8" r="3" fill="black"/><circle cx="23" cy="22" r="3" fill="black"/><path d="M7 8 C 12 18, 16 10, 23 22"/>'
  ),
  'tool-camframe': svg(
    '<rect x="4" y="8" width="22" height="14" rx="1.5" stroke-dasharray="3 2.5"/><path d="M4 12V8h4M26 12V8h-4M4 18v4h4M26 18v4h-4" stroke-width="2.5"/>'
  ),
}
