import fs from 'node:fs';
const html = fs.readFileSync('public/index.html', 'utf8');
const checks = [
  ['version 3.15.8', html.includes('v3.15.8')],
  ['overview navigation renamed', html.includes('<span>Overview</span>') && html.includes('title="Tournament Overview"')],
  ['spectator courts allowed', html.includes("!['score','public','results','director'].includes(id)")],
  ['shared spectator court presentation', html.includes('body.ksm-spectator #score .score-controls-grid') && html.includes('body.ksm-spectator #score .sk-action-row')],
  ['spectator court context visible', !html.includes('body.ksm-spectator #score{display:none')],
  ['dual court live scores', html.includes("liveScoresCourtCard('A')") && html.includes("liveScoresCourtCard('B')")],
  ['portrait vertical live scores', html.includes('@media(max-width:560px) and (orientation:portrait)') && html.includes('.live-courts-grid{grid-template-columns:1fr')],
  ['wide two column live scores', html.includes('.live-courts-grid{display:grid;grid-template-columns:repeat(2')],
  ['single court TV view', html.includes('function renderTvDisplay()') && html.includes('const court=tvAssignedCourt(),data=courtCurrentMatch(court);')],
  ['court specific TV links', html.includes("['TV Display — Court A',tvLink('A'),true]") && html.includes("['TV Display — Court B',tvLink('B'),true]")],
  ['TV has no normal navigation', html.includes('body.ksm-tv .ksm-topbar') && html.includes("requestedView==='tv'")],
  ['TV remains spectator read only', html.includes("url.searchParams.set('view','tv')") && html.includes("roleLink('spectator',court)")]
];
let pass = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (ok) pass++;
}
console.log(`Shared views and TV display: ${pass}/${checks.length} passed`);
if (pass !== checks.length) process.exit(1);
