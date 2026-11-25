import { html as appSource, readRepoFile } from './lib/ksm-source.mjs';
import fs from 'node:fs';
const html=appSource;
// M.13: the TV display is React. app/js/37-react-tv.js publishes what buildTV3ViewModel() (26-)
// chose, app/react/tv/ draws it (tests/golden/tv pins the result, recorded from the removed tv3
// renderer). Checks of TV markup point at that code.
const tvReact=readRepoFile('app/react/tv/Tv.tsx'),tvModel=readRepoFile('app/react/tv/tv-model.ts');
const kachinukiBody=tvReact.slice(tvReact.indexOf("case 'kachinuki':"),tvReact.indexOf('function Footer'));
const checks=[
 ['shared current zone',html.includes('.tv-kachinuki-main')&&html.includes('top:226px!important')],
 ['persistent upcoming footer',html.includes('top:748px!important')&&html.includes('grid-template-rows:114px 114px')],
 ['kachinuki renderer',html.includes('function ksmTvKachinuki(vm)')&&kachinukiBody.includes('data-testid="tv-kachinuki-current"')],
 ['kachinuki current above lineup',html.includes('tv-kachinuki-current')&&html.indexOf('tv-kachinuki-current')<html.indexOf('tv-kachinuki-lineups')],
 ['three fighter lineups',html.includes("slice(0,3)")],
 ['status only lineup',tvModel.includes("return index < active ? 'eliminated' : index === active ? 'active' : 'waiting';")&&tvReact.includes('<span>{row.name}</span><span className="tv3-k-state">{row.state}</span>')&&kachinukiBody.includes('<KachinukiRows rows={body.rowsW} />')],
 ['no kachinuki summary in renderer',kachinukiBody.length>0&&!kachinukiBody.includes('Summary')&&!kachinukiBody.includes('tv3-summary')],
 ['kachinuki uses team upcoming',html.includes("function isTeamMatch(m){return m && (m.type==='teamPosition'||m.type==='teamPlayoff'||m.type==='kachinuki')}")&&html.includes('teamMode=isTeamMatch(m);')&&html.includes('upcoming:tv3UpcomingModel(court,m,teamMode)')],
 ['render routes kachinuki to team context',html.includes("m.type==='teamPosition'||m.type==='teamPlayoff'||m.type==='kachinuki'")&&html.includes("format:m.type==='kachinuki'?'kachinuki':(teamMode?'team':'individual')")],
 ['centered standard teams',html.includes('grid-template-columns:820px 820px!important')&&html.includes('column-gap:100px!important')],
];
for(const [name,ok] of checks){if(!ok){console.error('FAIL',name);process.exitCode=1}else console.log('PASS',name)}
if(!process.exitCode)console.log(`v3.15.12 checks passed: ${checks.length}/${checks.length}`);
