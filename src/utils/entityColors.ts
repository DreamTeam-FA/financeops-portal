/**
 * Canonical entity color palette shared across all portal pages.
 * Badge class: bg-[hex]/20 text-[hex] — consistent with Tailwind inline color syntax.
 */

export const ENTITY_COLORS: Record<string, { hex: string; textHex: string }> = {
  "Ruby's":      { hex: "#d81b60", textHex: "#e91e63" },
  "TI":          { hex: "#1a73e8", textHex: "#1a73e8" },
  "MSDx":        { hex: "#00897b", textHex: "#00897b" },
  "CurcuminPro": { hex: "#6d4c41", textHex: "#8d6e63" },
  "Curcumin":    { hex: "#6d4c41", textHex: "#8d6e63" },
  "Ziglar":      { hex: "#059669", textHex: "#059669" },
  "4YR":         { hex: "#1565c0", textHex: "#64b5f6" },  // TI sub — darker navy blue
  "4G":          { hex: "#1a73e8", textHex: "#1a73e8" },  // TI sub — same TI blue
  "E1":          { hex: "#0288d1", textHex: "#29b6f6" },  // TI sub — lighter blue
  "CPG":         { hex: "#15803d", textHex: "#22c55e" },
};

const SUBSTRING_ORDER: [string, keyof typeof ENTITY_COLORS][] = [
  ["Ruby",     "Ruby's"],
  ["MSDx",     "MSDx"],
  ["Curcumin", "CurcuminPro"],
  ["Ziglar",   "Ziglar"],
  ["4YR",      "4YR"],
  ["4yr",      "4YR"],
  ["4G",       "4G"],
  ["4g",       "4G"],
  ["E1",       "E1"],
  ["CPG",      "CPG"],
];

/**
 * Sub-entities that belong to a parent entity.
 * Used so that filtering by "TI" still shows 4G / 4YR / E1 items.
 */
export const ENTITY_PARENT: Record<string, string> = {
  "4YR": "TI",
  "4G":  "TI",
  "E1":  "TI",
};

/**
 * Returns true when `entity` matches the filter set, including parent-entity
 * membership (e.g. "4G" matches when "TI" is in the set).
 */
export function entityMatchesFilter(entity: string, filterSet: Set<string>): boolean {
  if (filterSet.has("ALL")) return true;
  if (filterSet.has(entity)) return true;
  const parent = ENTITY_PARENT[entity];
  return !!parent && filterSet.has(parent);
}

/** Returns Tailwind badge classes: "bg-[hex]/20 text-[hex]" */
export function getEntityBadgeClass(entity: string): string {
  const c = ENTITY_COLORS[entity];
  if (c) return `bg-[${c.hex}]/20 text-[${c.textHex}]`;
  for (const [sub, key] of SUBSTRING_ORDER) {
    if (entity.includes(sub)) {
      const m = ENTITY_COLORS[key];
      return `bg-[${m.hex}]/20 text-[${m.textHex}]`;
    }
  }
  // Default: TI blue
  return `bg-[${ENTITY_COLORS.TI.hex}]/20 text-[${ENTITY_COLORS.TI.textHex}]`;
}

/** Returns the entity's primary hex color (for borders, text, icons). */
export function getEntityHex(entity: string): string {
  const c = ENTITY_COLORS[entity];
  if (c) return c.hex;
  for (const [sub, key] of SUBSTRING_ORDER) {
    if (entity.includes(sub)) return ENTITY_COLORS[key].hex;
  }
  return ENTITY_COLORS.TI.hex;
}
