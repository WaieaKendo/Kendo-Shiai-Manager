/** Results treats each done bout as finished, including each team position or kachinuki bout.
 * Read only allMatches: pools and brackets can reference those same bouts too. */
export function finishedMatchSummary(allMatches: Readonly<Record<string, readonly ({ done?: boolean } | null)[]>> = {}): { total: number; divisions: string[] } {
  let total = 0;
  const divisions: string[] = [];
  for (const [division, matches] of Object.entries(allMatches)) {
    const count = matches.filter(match => match?.done).length;
    if (count) { total += count; divisions.push(division); }
  }
  return { total, divisions };
}
