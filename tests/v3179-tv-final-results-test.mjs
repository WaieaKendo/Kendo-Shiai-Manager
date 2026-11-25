import { html as appSource, sw as appServiceWorker, readRepoFile } from './lib/ksm-source.mjs';
import fs from 'node:fs';
const html=appSource;
// M.13: the TV display is React. app/js/37-react-tv.js publishes what buildTV3ViewModel() (26-)
// chose, app/react/tv/ draws it (tests/golden/tv pins the result, recorded from the removed tv3
// renderer). Checks of TV markup point at that code.
const tvReact=readRepoFile('app/react/tv/Tv.tsx'),tvModel=readRepoFile('app/react/tv/tv-model.ts');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const sw=appServiceWorker;
const worker=fs.readFileSync('src-worker.js','utf8');
const checks=[
  [html.includes("division&&divisionComplete(division)&&resultPlacements(division).length"),'completed active division detection'],
  [html.includes("format:'results'"),'TV results view model'],
  // The court screen's completion panel: its data (ksmDivisionCompleteInput()) and component (DivisionCompletePanel).
  [html.includes('complete:ksmDivisionCompleteInput(vm.division,true)')&&tvReact.includes('<div className="tv3-body tv3-results-body"><DivisionCompletePanel view={body.complete} /></div>'),'shared Court completion markup'],
  [html.includes("if(vm.format==='results'){const next=vm.division?ksmNextCourtDivision(court,vm.division):null;\n    return {kind:'tv',...header,body:{kind:'results'")&&tvReact.includes("case 'results':"),'TV results render branch'],
  // Owner decision 6 (#29): an idle court's Upcoming may be "Up next on this court" (its title).
  [tvModel.includes("footer: input.body.kind === 'results' ? (input.nextDivision ? { kind: 'results', next: input.nextDivision } : { kind: 'results' })\n      : input.upNext ? { kind: 'upcoming', cards: input.upcoming, title: upNextTitle(input.upNext) }\n")&&tvReact.includes('<div className={footer.next ? \'tv3-results-footer tv3-results-has-next\' : \'tv3-results-footer\'}>')&&!tvReact.includes('DIVISION_COMPLETE_TEXT'),'results footer branch'],
  [html.includes('.tv3-results-body .division-complete-row'),'isolated TV results styling']
];
const failed=checks.filter(([ok])=>!ok);
for(const [ok,label] of checks)console.log(`${ok?'PASS':'FAIL'} ${label}`);
if(failed.length)process.exit(1);
