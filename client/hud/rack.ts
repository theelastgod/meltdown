/**
 * The rack called the DIRECTIVE "THE" (Stage 109).
 *
 * The weapon rack labels each slot with the first word of the weapon's name, which reads for
 * seven of the eight — LEASE-BREAKER, REPO, STACK, LONGWAVE, PHAGE, SHOCK, CLOCKEATER — and for
 * the eighth read `7 THE 12`, in every frame since the campaign weapons arrived in Stage 10. A
 * label is the word that names the thing; an article is not one.
 */

/** words that name nothing on their own */
const ARTICLES = new Set(["THE", "A", "AN"]);

/** The rack's one-word label for a weapon name: its first word that is not an article. */
export function rackLabel(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => w.length > 0);
  const named = words.find((w) => !ARTICLES.has(w.toUpperCase()));
  return named ?? words[0] ?? "";
}
