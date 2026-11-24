/**
 * Export d'une liste de beatmaps dans un seul fichier : texte, tableur (CSV), sauvegarde (JSON) ou
 * « téléchargeur » (une page HTML autonome qui télécharge toutes les beatmaps depuis un miroir).
 * Tout se fabrique dans le navigateur : rien n'est envoyé ni hébergé par shOsu!.
 */
import { OSU_BASE_URL } from "./osu";

export type ExportItem = {
  id: number;
  title: string;
  artist: string;
  creator: string;
  status: string;
  minStars: number | null;
  maxStars: number | null;
};

export type ExportFormat = "txt" | "csv" | "json" | "html";

export const EXPORT_FORMATS: { id: ExportFormat; label: string; hint: string }[] = [
  { id: "html", label: "Téléchargeur (.html)", hint: "Une page qui télécharge toutes les beatmaps en un clic" },
  { id: "txt", label: "Texte (.txt)", hint: "Une beatmap par ligne, avec son lien" },
  { id: "csv", label: "Tableur (.csv)", hint: "Pour Excel, Sheets…" },
  { id: "json", label: "Sauvegarde (.json)", hint: "Toutes les données de la liste" },
];

const url = (id: number) => `${OSU_BASE_URL}/beatmapsets/${id}`;

/** Mirroirs proposés par le téléchargeur : services communautaires indépendants de shOsu!. */
const MIRRORS = [
  { id: "beatconnect", label: "Beatconnect", template: "https://beatconnect.io/b/{id}" },
  { id: "catboy", label: "Mino (catboy.best)", template: "https://catboy.best/d/{id}" },
  { id: "nerinyan", label: "Nerinyan", template: "https://api.nerinyan.moe/d/{id}" },
  { id: "osu", label: "osu! officiel (connexion requise)", template: `${OSU_BASE_URL}/beatmapsets/{id}/download` },
  { id: "client", label: "Ouvrir dans le jeu (osu://)", template: "osu://s/{id}" },
] as const;

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );

/** Une cellule CSV : guillemets échappés, et préfixe contre l'exécution de formules par les tableurs. */
function csvCell(value: string | number | null): string {
  let text = value === null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const stars = (item: ExportItem) =>
  item.minStars !== null && item.maxStars !== null
    ? item.minStars === item.maxStars
      ? item.minStars.toFixed(2)
      : `${item.minStars.toFixed(2)}-${item.maxStars.toFixed(2)}`
    : "";

export const slug = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "liste";

function downloaderPage(name: string, items: ExportItem[]): string {
  // Les données sont intégrées en JSON ; « < » est échappé pour qu'un titre ne puisse jamais fermer la balise <script>.
  const payload = JSON.stringify({
    mirrors: MIRRORS,
    items: items.map((i) => ({ id: i.id, title: i.title, artist: i.artist, creator: i.creator })),
  }).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(name)} — téléchargeur shOsu!</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; padding: 32px 16px; background: #0b1020; color: #eef1ff; font: 15px/1.5 system-ui, sans-serif; }
  main { max-width: 760px; margin: 0 auto; }
  h1 { margin: 0 0 4px; font-size: 1.6rem; letter-spacing: -.03em; }
  p { color: #a7b0d0; margin: 6px 0; }
  .bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 18px 0; }
  select, button { padding: 10px 14px; border: 1px solid #2c3558; border-radius: 10px; color: #eef1ff; background: #151c36; font: inherit; }
  button.primary { background: #7a5cff; border-color: #a58cff; cursor: pointer; font-weight: 700; }
  button:disabled { opacity: .5; cursor: not-allowed; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  li { display: flex; gap: 12px; align-items: center; padding: 10px 14px; border: 1px solid #2c3558; border-radius: 12px; background: #11172c; }
  li.done { border-color: #3fbf8f; } li b { display: block; } li small { color: #a7b0d0; }
  li a { margin-left: auto; color: #c3adff; white-space: nowrap; }
  #status { min-height: 1.5em; color: #c3adff; }
  .note { font-size: .8rem; }
</style>
</head>
<body>
<main>
  <h1></h1>
  <p id="count"></p>
  <div class="bar">
    <label for="mirror">Source :</label>
    <select id="mirror"></select>
    <button class="primary" id="all">Tout télécharger</button>
  </div>
  <p id="status" role="status"></p>
  <ul id="list"></ul>
  <p class="note">Fichier généré par shOsu!. Les beatmaps viennent de services communautaires indépendants (shOsu! n'en héberge aucune) :
  si une source ne répond pas, choisis-en une autre. Ton navigateur peut demander d'autoriser les téléchargements multiples.</p>
</main>
<script>
const DATA = ${payload};
const NAME = ${JSON.stringify(name).replace(/</g, "\\u003c")};
const $ = (id) => document.getElementById(id);
document.querySelector("h1").textContent = NAME;
$("count").textContent = DATA.items.length + " beatmap" + (DATA.items.length > 1 ? "s" : "");
for (const m of DATA.mirrors) { const o = document.createElement("option"); o.value = m.template; o.textContent = m.label; $("mirror").append(o); }
const link = (id) => $("mirror").value.replace("{id}", String(id));
const rows = DATA.items.map((item) => {
  const li = document.createElement("li");
  const text = document.createElement("div");
  const b = document.createElement("b"); b.textContent = item.title;
  const s = document.createElement("small"); s.textContent = item.artist + " · " + item.creator;
  text.append(b, s);
  const a = document.createElement("a"); a.textContent = "Télécharger"; a.rel = "noopener noreferrer";
  li.append(text, a); $("list").append(li);
  return { item, li, a };
});
function refresh() { for (const r of rows) r.a.href = link(r.item.id); }
$("mirror").addEventListener("change", refresh); refresh();
$("all").addEventListener("click", async () => {
  $("all").disabled = true; $("mirror").disabled = true;
  let n = 0;
  for (const r of rows) {
    n++; $("status").textContent = "Téléchargement " + n + " / " + rows.length + " : " + r.item.title;
    const a = document.createElement("a"); a.href = link(r.item.id); a.rel = "noopener noreferrer"; a.target = "_blank";
    document.body.append(a); a.click(); a.remove();
    r.li.classList.add("done");
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  $("status").textContent = "Terminé : " + rows.length + " téléchargement(s) lancé(s).";
  $("all").disabled = false; $("mirror").disabled = false;
});
</script>
</body>
</html>
`;
}

export function buildExport(
  format: ExportFormat,
  name: string,
  items: ExportItem[],
): { filename: string; mime: string; content: string } {
  const base = `shosu-${slug(name)}`;
  switch (format) {
    case "txt": {
      const lines = items.map((i) => `${i.artist} - ${i.title} (mappé par ${i.creator}) ${url(i.id)}`);
      return {
        filename: `${base}.txt`,
        mime: "text/plain;charset=utf-8",
        content: `${name} — ${items.length} beatmap(s) — exporté depuis shOsu!\n\n${lines.join("\n")}\n`,
      };
    }
    case "csv": {
      const rows = [["id", "titre", "artiste", "mappeur", "statut", "etoiles", "lien"]]
        .concat(items.map((i) => [String(i.id), i.title, i.artist, i.creator, i.status, stars(i), url(i.id)]))
        .map((row) => row.map((cell) => csvCell(cell)).join(","));
      // BOM : Excel lit alors correctement les accents.
      return { filename: `${base}.csv`, mime: "text/csv;charset=utf-8", content: `﻿${rows.join("\r\n")}\r\n` };
    }
    case "json":
      return {
        filename: `${base}.json`,
        mime: "application/json;charset=utf-8",
        content: `${JSON.stringify(
          {
            app: "shOsu!",
            version: 1,
            name,
            exportedAt: new Date().toISOString(),
            beatmapsets: items.map((i) => ({ ...i, url: url(i.id) })),
          },
          null,
          2,
        )}\n`,
      };
    case "html":
      return {
        filename: `${base}-telechargeur.html`,
        mime: "text/html;charset=utf-8",
        content: downloaderPage(name, items),
      };
  }
}

/** Déclenche le téléchargement d'un fichier fabriqué dans le navigateur. */
export function saveFile(file: { filename: string; mime: string; content: string }): void {
  const blob = new Blob([file.content], { type: file.mime });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = file.filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 10_000);
}
