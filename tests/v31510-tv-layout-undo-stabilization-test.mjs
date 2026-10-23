import { html as appSource, readRepoFile } from './lib/ksm-source.mjs';
import fs from 'node:fs';
const html=appSource;
// M.13: the TV display is React. app/js/37-react-tv.js publishes what buildTV3ViewModel() (26-)
// chose, app/react/features/tv/ draws it (tests/golden/tv pins the result, recorded from the removed tv3
// renderer). Checks of TV markup point at that code.
const tvReact=readRepoFile('app/react/features/tv/Tv.tsx'),tvModel=readRepoFile('app/react/features/tv/tv-model.ts');
const checks=[
 // The tv3 point classes (the first renderer's tv-point-string tv-white/red-points never ran; removed in M.13).
 ['white point class',tvReact.includes('<div className="tv3-score white" data-testid="tv-white-score">')],
 ['red point class',tvReact.includes('<div className="tv3-score red" data-testid="tv-red-score">')],
 ['fixed medial white zone',html.includes('.tv-white-points{left:676px!important}')],
 ['fixed medial red zone',html.includes('.tv-red-points{left:956px!important}')],
 ['centered team width',html.includes('width:1760px!important') && html.includes('grid-template-columns:830px 830px!important')],
 ['round context visible',html.includes('tv-context-meta{display:block!important')],
 ['upcoming outlined cards',html.includes('border:2px solid rgba(255,255,255,.32)!important')],
 ['team later nodes included',html.includes("nodeCourt!=='BOTH'") && html.includes('tvTeamNodeEntries(court,current)')],
 ['court histories remain',html.includes('courtActionHistory:{A:[],B:[]}') && html.includes('courtRedoHistory:{A:[],B:[]}')],
 ['next match atomic history',html.includes('performCourtAction(completedLabel')],
];
let fail=0;
for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${n}`);if(!ok)fail++;}
if(fail)process.exit(1);
console.log(`v3.15.10 checks passed: ${checks.length}/${checks.length}`);
