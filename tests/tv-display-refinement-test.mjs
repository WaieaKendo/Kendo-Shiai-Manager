import fs from 'node:fs';
const html=fs.readFileSync('public/index.html','utf8');
const checks=[
 ['version 3.15.8',html.includes('v3.15.8')],
 ['tournament name removed from TV renderer',!html.includes('<div class="tv-tournament">${esc(audienceTournamentName())}</div>')],
 ['court is primary heading',html.includes('tv-court-label')&&html.includes('Court ${esc(court)}')],
 ['division is gold context',html.includes('.tv-context')&&html.includes('color:#e3bd5b')],
 ['individual point letters replace numeric score',html.includes('tvPointText(pts.W)')&&html.includes('tvPointText(pts.R)')&&!html.includes('tv-score"><strong>')],
 ['names auto fit',html.includes('function fitTvText')&&html.includes('data-tv-fit')],
 ['thick white and red indicators',html.includes('border-left:clamp(11px')&&html.includes('border-right:clamp(11px')],
 ['large next match section',html.includes('.tv-next-player strong')&&html.includes('font-size:clamp(34px,4.1vmin,68px)')],
 ['team sequence mirrors court context',html.includes('tvTeamHtml')&&html.includes('matches.map((x,i)=>')],
 ['current team pair gold outlined',html.includes('tv-team-cell ${x===m?\'current\':\'\'}')&&html.includes('.tv-team-cell.current')],
 ['one court per TV link remains',html.includes("url.searchParams.set('court',court)")],
 ['engine remains frozen',html.includes("engineVersion:'3.12.9'")]
];
let failed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'}: ${name}`);if(!ok)failed++;}
if(failed)process.exit(1);console.log(`TV display refinement: ${checks.length}/${checks.length} passed`);
