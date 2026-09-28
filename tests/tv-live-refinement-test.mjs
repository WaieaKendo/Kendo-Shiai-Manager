import { html as appSource, readRepoFile } from './lib/ksm-source.mjs';
import fs from 'node:fs';
const html=appSource;
// M.13: Live Scores is React. app/js/36-react-live-scores.js publishes a team match's sheet as the
// court screen's sheet data, app/react/live-scores/LiveScores.tsx draws it with the court
// screen's context panel (tests/golden/live-scores pins the result).
const liveReact=readRepoFile('app/react/live-scores/LiveScores.tsx');
const checks=[
 ['TV navigation available',html.includes('id="tvMenu"')&&html.includes("launchTvDisplay('A')")&&html.includes("launchTvDisplay('B')")],
 ['TV opens separate court link',html.includes("window.open(tvLink(court),'_blank','noopener')")],
 ['TV header has no generic header chrome',html.includes('.tv-shell header{all:unset')],
 ['division larger beneath court',html.includes('.tv-context{')&&html.includes('font-size:clamp(34px,3.8vw,62px)')],
 ['pool metadata remains beneath division',html.includes('tv-context-meta')&&html.includes('${esc(meta.line)}')],
 ['individual points are medial',html.includes('grid-template-columns:minmax(0,1fr) auto auto auto minmax(0,1fr)')],
 ['individual names split first and remaining names',html.includes('function tvNameLines')&&html.includes('function tvNameHtml')],
 ['next match moved and enlarged',html.includes('align-self:end')&&html.includes('Upcoming Matches')],
 ['team names auto fit',html.includes('class="tv-team-name" data-tv-fit')],
 ['team next match uses team names',html.includes('function tvUpcomingHtml')&&html.includes('next.teamWhite')&&html.includes('next.teamRed')],
 ['team wins and points shown',html.includes('tv-team-summary')&&html.includes('summary.wWins')&&html.includes('summary.rPts')],
 ['team live scores use court-context sheet',html.includes("if(m.type==='kachinuki')return {...base,kind:'kachinuki',sheet:ksmKachinukiSheet(m),next:nextTeams};")&&html.includes("return {...base,kind:'team',sheet:ksmTeamSheet(m.division,m.teamPair,m),next:nextTeams};")&&liveReact.includes("case 'team': return <ContextPanel view={{ kind: 'team-sheet', ...body.sheet }} />;")&&liveReact.includes("case 'kachinuki': return <ContextPanel view={{ kind: 'kachinuki', ...body.sheet }} />;")],
 ['frozen engine retained',html.includes("engineVersion:'3.12.9'")]
];
let failed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
if(failed)process.exit(1);console.log(`TV and Live Scores refinement: ${checks.length}/${checks.length} passed`);
