import fs from 'node:fs';
const html=fs.readFileSync('public/index.html','utf8');
const checks=[
 ['v3.15.5 visible',html.includes('v3.15.5')],
 ['TV navigation available',html.includes('id="tvMenu"')&&html.includes("launchTvDisplay('A')")&&html.includes("launchTvDisplay('B')")],
 ['TV opens separate court link',html.includes("window.open(tvLink(court),'_blank','noopener')")],
 ['TV header has no generic header chrome',html.includes('.tv-shell header{all:unset')],
 ['division larger beneath court',html.includes('.tv-context{')&&html.includes('font-size:clamp(34px,3.8vw,62px)')],
 ['pool metadata remains beneath division',html.includes('tv-context-meta')&&html.includes('${esc(meta.line)}')],
 ['individual points are medial',html.includes('grid-template-columns:minmax(0,1fr) auto auto auto minmax(0,1fr)')],
 ['individual names split first and remaining names',html.includes('function tvNameLines')&&html.includes('function tvNameHtml')],
 ['next match moved and enlarged',html.includes('align-self:end')&&html.includes('font-size:clamp(40px,4.5vw,76px)')],
 ['team names auto fit',html.includes('class="tv-team-name" data-tv-fit')],
 ['team next match uses team names',html.includes('function tvTeamNextHtml')&&html.includes('next.teamWhite')&&html.includes('next.teamRed')],
 ['team wins and points shown',html.includes('tv-team-summary')&&html.includes('summary.wWins')&&html.includes('summary.rPts')],
 ['team live scores use court-context sheet',html.includes("m.type==='kachinuki'?kachinukiSheetHtml(m):teamSheetHtml(m.division,m.teamPair,m)")],
 ['frozen engine retained',html.includes("engineVersion:'3.12.9'")]
];
let failed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
if(failed)process.exit(1);console.log(`TV and Live Scores refinement: ${checks.length}/${checks.length} passed`);
