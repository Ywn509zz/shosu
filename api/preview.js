export default async function handler(req, res) {
  res.setHeader('Allow', 'GET');
  if (req.method !== 'GET') return res.status(405).end('Method not allowed');
  const raw = typeof req.query.url === 'string' ? req.query.url : '';
  let url;
  try { url = new URL(raw); } catch { return res.status(400).end('Invalid URL'); }
  if (url.protocol !== 'https:' || url.hostname !== 'assets.ppy.sh' || url.port || url.username || url.password) {
    return res.status(400).end('Invalid preview host');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const upstream = await fetch(url.toString(), { signal: controller.signal, redirect: 'error' });
    if (!upstream.ok) return res.status(502).end('Preview unavailable');
    const type = upstream.headers.get('content-type') || '';
    if (!type.startsWith('audio/') && type !== 'application/octet-stream') return res.status(502).end('Invalid preview content');
    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength > 8 * 1024 * 1024) return res.status(413).end('Preview too large');
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).send(Buffer.from(bytes));
  } catch {
    return res.status(502).end('Preview unavailable');
  } finally { clearTimeout(timeout); }
}
