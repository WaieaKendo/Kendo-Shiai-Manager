import { html as appSource, readRepoFile } from './lib/ksm-source.mjs';
import fs from 'node:fs';
const html=appSource;
// M.13: Live Scores is React. app/js/36-react-live-scores.js publishes a team match's sheet as the
// court screen's sheet data, app/react/live-scores/LiveScores.tsx draws it with the court
// screen's context panel (tests/golden/live-scores pins the result).
const liveReact=readRepoFile('app/react/live-scores/LiveScores.tsx');
// M.13: the TV display is React. app/js/37-react-tv.js publishes what buildTV3ViewModel() (26-)
// chose, app/react/tv/ draws it (tests/golden/tv pins the result, recorded from the removed tv3
// renderer). Checks of TV markup point at that code.
const tvReact=readRepoFile('app/react/tv/Tv.tsx'),tvModel=readRepoFile('app/react/tv/tv-model.ts');
// "team names auto fit" (data-tv-fit on .tv-team-name) is gone: it pinned the first TV renderer,
// which never ran (the tv3 renderer never fitted names); removed with that dead code in M.13.
const checks=[
 ['TV navigation available',html.includes('id="tvMenu"')&&html.includes("launchTvDisplay('A')")&&html.includes("launchTvDisplay('B')")],
 ['TV opens separate court link',html.includes("window.open(tvLink(court),'_blank','noopener')")],
 ['TV header has no generic header chrome',html.includes('.tv-shell header{all:unset')],
 ['division larger beneath court',html.includes('.tv-context{')&&html.includes('font-size:clamp(34px,3.8vw,62px)')],
 ['pool metadata remains beneath division',html.includes("meta:ksmIsRoundRobinDaihyosen(vm.match)?ksmDaihyosenLabel():ksmText(vm.meta?.line||'')")&&tvReact.indexOf('data-testid="tv-meta"')>tvReact.indexOf('data-testid="tv-division"')&&tvReact.indexOf('data-testid="tv-division"')>0],
 ['individual points are medial',html.includes('grid-template-columns:minmax(0,1fr) auto auto auto minmax(0,1fr)')],
 ['individual names split first and remaining names',tvModel.includes("return rest.length ? [first, rest.join(' ')] : [first];")&&tvReact.includes('{player.nameParts.map((part, i) => <span key={i}>{part}</span>)}')],
 ['next match moved and enlarged',html.includes('align-self:end')&&html.includes('Upcoming Matches')],
 ['team next match uses team names',html.includes("if(teamMode)return side==='white'?(match.teamWhite||match.wdojo||")&&html.includes("(match.teamRed||match.rdojo||")&&html.includes("left:tv3Side(m,'white',teamMode),right:tv3Side(m,'red',teamMode)")],
 ['team wins and points shown',html.includes('tv-team-summary')&&html.includes('summary.wWins')&&html.includes('summary.rPts')],
 ['team live scores use court-context sheet',html.includes("if(m.type==='kachinuki')return {...base,kind:'kachinuki',sheet:ksmKachinukiSheet(m),next:nextTeams,hansoku:ksmHansokuCounts(m)};")&&html.includes("return {...base,kind:'team',sheet:ksmTeamSheet(m.division,m.teamPair,m),next:nextTeams,hansoku:ksmHansokuCounts(m)};")&&liveReact.includes("case 'team': return <><ContextPanel view={{ kind: 'team-sheet', ...body.sheet }} /><BoutHansoku hansoku={body.hansoku} /></>;")&&liveReact.includes("case 'kachinuki': return <><ContextPanel view={{ kind: 'kachinuki', ...body.sheet }} /><BoutHansoku hansoku={body.hansoku} /></>;")],
 ['frozen engine retained',html.includes("engineVersion:'3.12.9'")]
];
let failed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
if(failed)process.exit(1);console.log(`TV and Live Scores refinement: ${checks.length}/${checks.length} passed`);
