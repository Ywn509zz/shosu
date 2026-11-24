import { describe, expect, it } from "vitest";

import { buildExport, slug } from "~/lib/export";

const hostile = {
  id: 41823,
  title: 'Evil </script><img src=x onerror=alert(1)> "q" & co',
  artist: "xi, feat.",
  creator: "A'B",
  status: "ranked",
  minStars: 2,
  maxStars: 6.5,
};
const formula = { ...hostile, id: 2, title: '=HYPERLINK("http://x")' };

describe("export de liste", () => {
  it("CSV : guillemets échappés et formules neutralisées", () => {
    const csv = buildExport("csv", "Ma liste", [hostile, formula]).content;
    expect(csv).toContain('"Evil </script><img src=x onerror=alert(1)> ""q"" & co"');
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(csv.startsWith("\uFEFF")).toBe(true);
  });

  it("HTML : aucun titre ne peut fermer la balise script ni injecter de balise", () => {
    const html = buildExport("html", "Ma <b>liste</b>", [hostile]).content;
    expect(html).not.toContain("</script><img");
    expect(html).toContain("\\u003c/script>");
    expect(html).toContain("&lt;b&gt;liste&lt;/b&gt;"); // <title> échappé
  });

  it("JSON valide et TXT avec lien", () => {
    const json = JSON.parse(buildExport("json", "L", [hostile]).content);
    expect(json.beatmapsets[0].url).toBe("https://osu.ppy.sh/beatmapsets/41823");
    expect(buildExport("txt", "L", [hostile]).content).toContain("https://osu.ppy.sh/beatmapsets/41823");
  });

  it("slug sûr pour un nom de fichier", () => {
    expect(slug("Mes Favoris ! é/..")).toBe("mes-favoris-e");
    expect(slug("###")).toBe("liste");
  });
});
