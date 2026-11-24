// Faux Redis (API REST d'Upstash, /pipeline) pour les tests locaux.
import http from "node:http";
const kv = new Map(); // clé -> {type:'hash', v: Map} | {type:'str', v}
let cmds = 0;
const hashOf = (k, create = false) => { let e = kv.get(k); if (!e && create) { e = { type: "hash", v: new Map() }; kv.set(k, e); } return e?.v; };
function run([cmd, ...a]) {
  cmds++;
  switch (String(cmd).toUpperCase()) {
    case "INCR": { const e = kv.get(a[0]) ?? { type: "str", v: 0 }; e.v = Number(e.v) + 1; kv.set(a[0], e); return e.v; }
    case "TTL": return kv.has(a[0]) ? 60 : -2;
    case "EXPIRE": return 1;
    case "HSET": hashOf(a[0], true).set(String(a[1]), String(a[2])); return 1;
    case "HINCRBY": { const h = hashOf(a[0], true); const v = Number(h.get(String(a[1])) ?? 0) + Number(a[2]); h.set(String(a[1]), String(v)); return v; }
    case "HGET": return hashOf(a[0])?.get(String(a[1])) ?? null;
    case "HDEL": return hashOf(a[0])?.delete(String(a[1])) ? 1 : 0;
    case "HEXISTS": return hashOf(a[0])?.has(String(a[1])) ? 1 : 0;
    case "HLEN": return hashOf(a[0])?.size ?? 0;
    case "HGETALL": return [...(hashOf(a[0]) ?? [])].flat();
    case "DEL": return kv.delete(a[0]) ? 1 : 0;
    default: throw new Error("unsupported " + cmd);
  }
}
http.createServer(async (req, res) => {
  let raw = ""; for await (const c of req) raw += c;
  if (req.url === "/stats") { res.end(JSON.stringify({ cmds, keys: [...kv.keys()] })); return; }
  try { const out = JSON.parse(raw).map((c) => { try { return { result: run(c) }; } catch (e) { return { error: e.message }; } }); res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(out)); }
  catch { res.writeHead(400); res.end("{}"); }
}).listen(4030, () => console.log("mock redis on 4030"));
