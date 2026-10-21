let cachedToken = null;
let expiresAt = 0;

async function accessToken() {
  if (cachedToken && Date.now() < expiresAt - 60000) return cachedToken;
  const { CLIENT_ID, CLIENT_SECRET } = process.env;
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('Missing osu! credentials');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch('https://osu.ppy.sh/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: 'public' }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`osu! OAuth HTTP ${response.status}`);
    const data = await response.json();
    if (!data.access_token) throw new Error('osu! OAuth missing access token');
    cachedToken = data.access_token;
    expiresAt = Date.now() + Math.max(60, Number(data.expires_in) || 3600) * 1000;
    return cachedToken;
  } finally { clearTimeout(timeout); }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Allow', 'GET');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q || q.length > 200) return res.status(400).json({ error: 'Query must be 1-200 characters' });
  try {
    const token = await accessToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let upstream;
    try {
      upstream = await fetch(`https://osu.ppy.sh/api/v2/beatmapsets/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: controller.signal,
      });
    } finally { clearTimeout(timeout); }
    if (!upstream.ok) return res.status(upstream.status === 429 ? 429 : 502).json({ error: 'osu! search temporarily unavailable' });
    return res.status(200).json(await upstream.json());
  } catch (err) {
    console.error('osu! search error:', err?.name || 'Error');
    return res.status(502).json({ error: 'Search temporarily unavailable' });
  }
}
