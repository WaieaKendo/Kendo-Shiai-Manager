// @ts-check
/**
 * Pool standings; tied groups are ordered by their tiebreaks (their pool record is kept in wins/pts).
 * @param {string} poolLabel
 * @param {string} [div]
 * @returns {PoolStandingRow[]}
 */
function poolStandings(poolLabel,div=state.currentDivision){
  /* ksm:post-split-begin engine-bridge */const pool=(state.pools[div]||[]).find(p=>p.label===poolLabel);return pool?KSMEngine.poolStandings(pool,state.allMatches[div]||[],requiredSeedPlaces(div)[poolLabel]||2):[];
  /* ksm:post-split-end */
}
