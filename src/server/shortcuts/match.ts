/** A candidate from srv_match_habit. */
export type Candidate = { habit_id: string; name: string; score: number };

/**
 * docs/spec/05-api.md §5 "Matching a habit by voice": an exact match, a single candidate, or a
 * best candidate at least 0.15 ahead of the next wins; otherwise ask which one.
 */
export function decideMatch(
  candidates: readonly Candidate[],
):
  | { type: "match"; habitId: string }
  | { type: "ambiguous"; choices: Candidate[] }
  | { type: "none" } {
  const [best, next] = candidates;
  if (!best) return { type: "none" };
  if (best.score >= 1 || !next || best.score - next.score >= 0.15) {
    return { type: "match", habitId: best.habit_id };
  }
  return { type: "ambiguous", choices: candidates.slice(0, 5) as Candidate[] };
}
