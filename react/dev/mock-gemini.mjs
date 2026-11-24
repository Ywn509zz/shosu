// Faux Gemini : répond en flux (SSE), mot par mot, et sait déclencher un appel d'outil.
import http from "node:http";
import { appendFileSync } from "node:fs";
const PORT = 4020;
const sse = (res, obj) => res.write(`data: ${JSON.stringify(obj)}\r\n\r\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

http.createServer(async (req, res) => {
  let raw = "";
  for await (const c of req) raw += c;
  const body = JSON.parse(raw || "{}");
  const contents = body.contents ?? [];
  const last = contents[contents.length - 1];
  const hasResponse = last?.parts?.some((p) => p.functionResponse);
  const userText = [...contents].reverse().find((c) => c.role === "user" && c.parts?.some((p) => p.text))?.parts.find((p) => p.text)?.text ?? "";
  if (hasResponse) { for (const p of last.parts) if (p.functionResponse) appendFileSync(new URL("./tool-responses.log", import.meta.url), JSON.stringify(p.functionResponse) + "\n"); }
  res.writeHead(200, { "Content-Type": "text/event-stream" });

  const tools = (body.tools?.[0]?.functionDeclarations ?? []).map((t) => t.name);
  const wants = (name) => tools.includes(name);
  const call = process.env.MOCK_CALL; // ex. MOCK_CALL=get_my_profile
  const m = /\[tool:([a-z_]+)(?: (\{.*\}))?\]/.exec(userText);

  if (m && !hasResponse && wants(m[1])) {
    await sleep(500);
    sse(res, { candidates: [{ content: { role: "model", parts: [{ functionCall: { name: m[1], args: m[2] ? JSON.parse(m[2]) : {} } }] } }] });
    return res.end();
  }
  const reply = hasResponse
    ? "J'ai bien consulté les données de ton compte osu!. Voilà ce que je vois : un joueur régulier, avec une belle progression ces derniers mois, surtout en standard. Veux-tu que je te propose des beatmaps pour continuer à monter ?"
    : "Salut ! Je suis Stack, ton assistant pour trouver des beatmaps. Dis-moi ce que tu aimes jouer et je m'occupe du reste, avec plaisir.";
  await sleep(700);
  for (const word of reply.split(/(?<=\s)/)) {
    sse(res, { candidates: [{ content: { role: "model", parts: [{ text: word }] } }] });
    await sleep(70);
  }
  res.end();
}).listen(PORT, () => console.log("mock gemini on", PORT));
