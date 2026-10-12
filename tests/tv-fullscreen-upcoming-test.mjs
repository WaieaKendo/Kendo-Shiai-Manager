import fs from 'node:fs';
const html=fs.readFileSync('public/index.html','utf8');
const checks=[
 ['TV court locked from URL',html.includes('function tvAssignedCourt()')&&html.includes("new URLSearchParams(location.search).get('court')")],
 ['TV render uses assigned court',html.includes('const court=tvAssignedCourt(),data=courtCurrentMatch(court);')],
 ['TV fixed 16:9 canvas',html.includes('width:1920px;height:1080px')&&html.includes('fitTvCanvas')],
 ['portrait gate removed',!html.includes('id=\"tvRotate\"')],
 ['upcoming matches label',html.includes('Upcoming Matches')],
 ['two upcoming rows',html.includes('slice(0,2)')&&html.includes('tv-upcoming-list')],
 ['no TV white red labels',!html.includes('<div class="tv-side-label">White')&&!html.includes('<div class="tv-side-label">Red')],
 ['Live Scores framed heading',html.includes('.live-scores-heading{max-width:1320px')&&html.includes('border:1px solid var(--line)')],
 ['TV initialization does not set publicCourt',!html.includes("state.publicCourt=court||'A';renderTvDisplay();show('tv')")]
];
let failed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
if(failed)process.exit(1);console.log(`TV full-screen/upcoming: ${checks.length}/${checks.length} passed`);
