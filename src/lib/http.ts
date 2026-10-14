// Unified HTTP for comic sources.
// Inside the Capacitor shell requests go through the native layer
// (CapacitorHttp), which is not bound by WebView CORS rules — many comic
// sites answer browsers with no Access-Control-Allow-Origin, so a plain
// fetch() from the WebView would be blocked even though the site itself is
// reachable. On the plain web build we fall back to fetch.
import { Capacitor, CapacitorHttp } from '@capacitor/core'

const DEFAULT_UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'

export interface HttpText {
  text: string
  /** final URL after redirects (may differ from the request URL) */
  url: string
  status: number
}

export async function httpGetText(url: string, headers: Record<string, string> = {}, timeoutMs = 20000): Promise<HttpText> {
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.request({
      method: 'GET',
      url,
      headers: { 'User-Agent': DEFAULT_UA, ...headers },
      responseType: 'text',
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs,
    })
    const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
    if (res.status >= 400) throw new Error(`HTTP ${res.status}`)
    return { text, url: res.url || url, status: res.status }
  }
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const r = await fetch(url, { headers: { 'User-Agent': DEFAULT_UA, ...headers }, redirect: 'follow', signal: ctrl.signal })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return { text: await r.text(), url: r.url, status: r.status }
  } finally {
    clearTimeout(t)
  }
}

export function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}
