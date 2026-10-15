/*
 * A soft pastel tone per event theme, taken from the brand illustrations
 * (sky blue, sage, coral, sand). The theme is free text typed by the owner,
 * so known words pick a fitting tone and anything else falls back to a stable
 * tone derived from the text: the same theme always gets the same color.
 */

export type ThemeTone = {
  /** Background tint and thin top band for a card or info box. */
  surface: string;
  /** Solid tone for the box that stands in for a photo an event has not got. */
  placeholder: string;
};

const TONES = {
  celeste: {
    surface: "bg-celeste-50 border-t-[3px] border-t-celeste-300",
    placeholder: "bg-celeste-300",
  },
  salvia: {
    surface: "bg-salvia-50 border-t-[3px] border-t-salvia-300",
    placeholder: "bg-salvia-300",
  },
  coral: {
    surface: "bg-coral-50 border-t-[3px] border-t-coral-300",
    placeholder: "bg-coral-300",
  },
  arena: {
    surface: "bg-arena-50 border-t-[3px] border-t-arena-300",
    placeholder: "bg-arena-300",
  },
} satisfies Record<string, ThemeTone>;

const KEYWORD_TONES: [RegExp, keyof typeof TONES][] = [
  [/pint|acuarel|arte|dibuj|cer[aá]mic|ilustr/, "celeste"],
  [/escrit|lectur|literat|poes|libro/, "salvia"],
  [/charla|cocin|t[eé]\b|merienda|brunch/, "coral"],
];

const FALLBACK_ORDER = [TONES.celeste, TONES.salvia, TONES.coral, TONES.arena];

export function themeTone(theme: string | null): ThemeTone {
  const normalized = (theme ?? "").trim().toLowerCase();
  if (!normalized) {
    return TONES.arena;
  }
  for (const [pattern, tone] of KEYWORD_TONES) {
    if (pattern.test(normalized)) {
      return TONES[tone];
    }
  }
  let hash = 0;
  for (const char of normalized) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return FALLBACK_ORDER[hash % FALLBACK_ORDER.length];
}
