import { html as appSource, readRepoFile } from './lib/ksm-source.mjs';
import fs from 'node:fs';
const html=appSource;
// M.13: the TV display is React. app/js/37-react-tv.js publishes what buildTV3ViewModel() (26-)
// chose, app/react/features/tv/ draws it (tests/golden/tv pins the result, recorded from the removed tv3
// renderer). Checks of TV markup point at that code.
const tvReact=readRepoFile('app/react/features/tv/Tv.tsx'),tvModel=readRepoFile('app/react/features/tv/tv-model.ts');
const checks=[
 ['TV court locked from URL',html.includes('function tvAssignedCourt()')&&html.includes("new URLSearchParams(location.search).get('court')")],
 ['TV render uses assigned court',html.includes('ksmPublishTv(ksmTvDisplayInput(tvAssignedCourt()));')&&html.includes('function buildTV3ViewModel(court){\n  const data=courtCurrentMatch(court);')],
 // The 1920x1080 canvas is the tv3 root (fitTvCanvas() belonged to the first TV renderer, which never ran; removed in M.13).
 ['TV fixed 16:9 canvas',html.includes('width:1920px;height:1080px')&&tvReact.includes('<div className="tv3-root" data-testid="tv-canvas">')],
 ['portrait gate removed',!html.includes('id=\"tvRotate\"')],
 ['upcoming matches label',html.includes('Upcoming Matches')],
 ['two upcoming rows',html.includes('(tvUpcomingMatches(court,current,teamMode)||[]).slice(0,2)')&&html.includes('while(found.length<2)found.push(null);')&&tvReact.includes('<div className="tv3-upcoming" data-testid="tv-upcoming">')],
 ['no TV white red labels',!html.includes('<div class="tv-side-label">White')&&!html.includes('<div class="tv-side-label">Red')],
 ['Live Scores framed heading',html.includes('.live-scores-heading{max-width:1320px')&&html.includes('border:1px solid var(--line)')],
 ['TV initialization does not set publicCourt',!html.includes("state.publicCourt=court||'A';renderTvDisplay();show('tv')")]
];
let failed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
if(failed)process.exit(1);console.log(`TV full-screen/upcoming: ${checks.length}/${checks.length} passed`);
