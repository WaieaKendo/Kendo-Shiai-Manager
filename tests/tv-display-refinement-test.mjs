import { html as appSource, readRepoFile } from './lib/ksm-source.mjs';
import fs from 'node:fs';
const html=appSource;
// M.13: the TV display is React. app/js/37-react-tv.js publishes what buildTV3ViewModel() (26-)
// chose, app/react/tv/ draws it (tests/golden/tv pins the result, recorded from the removed tv3
// renderer). Checks of TV markup point at that code.
const tvReact=readRepoFile('app/react/tv/Tv.tsx'),tvModel=readRepoFile('app/react/tv/tv-model.ts');
// "names auto fit" (fitTvText(), data-tv-fit) is gone: it pinned the first TV renderer, which never ran
// (the tv3 renderer that replaced it in v3.15.13 never fitted names; it was removed with that dead
// code in M.13). Large TV names are checked by tv-display-test.py (name font size).
const checks=[
 ['tournament name removed from TV renderer',!html.includes('<div class="tv-tournament">${esc(audienceTournamentName())}</div>')],
 ['court is primary heading',tvModel.includes('court: `Court ${input.court}`')&&tvReact.includes('<div className="tv3-court" data-testid="tv-court">{view.header.court}</div>')],
 ['division is gold context',html.includes('.tv-context')&&html.includes('color:#e3bd5b')],
 ['individual point letters replace numeric score',tvModel.includes('whitePoints: pointText(body.points.W), redPoints: pointText(body.points.R)')&&!html.includes('tv-score"><strong>')&&!tvReact.includes('tv-score"><strong>')],
 ['thick white and red indicators',html.includes('border-left:clamp(11px')&&html.includes('border-right:clamp(11px')],
 ['large next match section',html.includes('.tv-next-player strong')&&html.includes('font-size:clamp(34px,4.1vmin,68px)')],
 ['team sequence mirrors court context',html.includes("function ksmTvTeam(vm){\n  const m=vm.match,all=(state.allMatches[m.division]||[]).filter(x=>x.teamPair===m.teamPair&&(x.type==='teamPosition'||x.type==='teamPlayoff'));")&&tvReact.includes('{body.rows.map(row => (')],
 ['current team pair gold outlined',tvReact.includes("className={`tv3-team-row${row.active ? ' active' : ''}`}")&&html.includes('.tv3-team-row.active{border:5px solid #e3bd5b!important')],
 ['one court per TV link remains',html.includes("url.searchParams.set('court',court)")],
 ['engine remains frozen',html.includes("engineVersion:'3.12.9'")]
];
let failed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'}: ${name}`);if(!ok)failed++;}
if(failed)process.exit(1);console.log(`TV display refinement: ${checks.length}/${checks.length} passed`);
