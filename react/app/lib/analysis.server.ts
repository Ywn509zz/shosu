import { cached } from "./cache.server";
import type { DifficultyAnalysis, DifficultyRow } from "./insights";
import { applyMods, modLabel } from "./mods";
import { getDifficulty, osuPost } from "./osu.server";

/** Combinaisons étudiées. HR n'existe pas en mania ; FL n'est étudié qu'en standard. */
function combos(mode: string): string[][] {
  const list: string[][] = [[], ["EZ"], ["HT"], ["DT"]];
  if (mode !== "mania") list.splice(2, 0, ["HR"]);
  if (mode === "osu") list.push(["DT", "HR"], ["FL"]);
  return list;
}

type RawAttributes = {
  attributes?: {
    star_rating?: number;
    max_combo?: number;
    aim_difficulty?: number;
    speed_difficulty?: number;
    flashlight_difficulty?: number;
    slider_factor?: number;
    speed_note_count?: number;
    approach_rate?: number;
    overall_difficulty?: number;
  };
};

const finite = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const round2 = (value: number | null) => (value === null ? null : Math.round(value * 100) / 100);

/**
 * Difficulté d'une beatmap avec chaque mod : étoiles recalculées par osu! (POST /beatmaps/{id}/attributes),
 * AR/OD/CS/HP/BPM/durée calculés avec les formules des mods. Mis en cache 1 h (les valeurs ne changent pas).
 */
export function analyzeDifficulty(beatmapId: number): Promise<DifficultyAnalysis> {
  return cached(`analysis:${beatmapId}`, 60 * 60_000, async () => {
    const diff = await getDifficulty(beatmapId);
    const standard = diff.mode === "osu";
    const base = {
      cs: diff.cs,
      ar: diff.ar,
      od: diff.od,
      hp: diff.hp,
      bpm: diff.bpm,
      lengthSeconds: diff.lengthSeconds,
    };

    const settled = await Promise.allSettled(
      combos(diff.mode).map(async (mods) => {
        const response = await osuPost<RawAttributes>(`/beatmaps/${beatmapId}/attributes`, { mods, ruleset: diff.mode });
        return { mods, attributes: response.attributes ?? {} };
      }),
    );

    const rows: DifficultyRow[] = [];
    let nm: RawAttributes["attributes"] | null = null;
    for (const result of settled) {
      if (result.status !== "fulfilled") continue;
      const { mods, attributes } = result.value;
      if (mods.length === 0) nm = attributes;
      const computed = applyMods(base, mods, standard);
      rows.push({
        mods,
        label: modLabel(mods),
        stars: round2(finite(attributes.star_rating)),
        // AR/OD recalculés avec les formules des mods ; la valeur d'osu! ne sert que si le calcul est impossible.
        ar: computed.ar ?? (standard && finite(attributes.approach_rate) !== null ? Math.round(attributes.approach_rate! * 10) / 10 : null),
        od: computed.od ?? (standard && finite(attributes.overall_difficulty) !== null ? Math.round(attributes.overall_difficulty! * 10) / 10 : null),
        cs: computed.cs,
        hp: computed.hp,
        bpm: computed.bpm,
        lengthSeconds: computed.lengthSeconds,
        maxCombo: finite(attributes.max_combo) ?? diff.maxCombo,
      });
    }
    if (rows.length === 0) throw new Error("no attributes");

    const aim = round2(finite(nm?.aim_difficulty));
    const speed = round2(finite(nm?.speed_difficulty));
    const skills = standard && nm
      ? {
          aim,
          speed,
          flashlight: round2(finite(nm.flashlight_difficulty)),
          sliderFactor: round2(finite(nm.slider_factor)),
          speedNotes: finite(nm.speed_note_count) === null ? null : Math.round(nm.speed_note_count!),
        }
      : null;

    let profile: DifficultyAnalysis["profile"] = null;
    if (aim !== null && speed !== null && speed > 0) {
      const ratio = aim / speed;
      profile = ratio >= 1.18 ? "aim" : ratio <= 0.95 ? "speed" : "balanced";
    }

    return {
      beatmapId: diff.id,
      setId: diff.setId,
      mode: diff.mode,
      version: diff.version,
      title: diff.title,
      rows,
      skills,
      profile,
    };
  });
}
