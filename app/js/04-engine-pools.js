// @ts-check
/**
 * @param {string} div
 * @returns {boolean}
 */
function isTeamDivision(div){return !!ksmTeamDivision(div)||div==='Team Tournament'||/team|kachinuki/i.test(state.divisionTypes[div]||'')}