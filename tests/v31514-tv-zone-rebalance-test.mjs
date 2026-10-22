import { html as appSource, readRepoFile } from './lib/ksm-source.mjs';
import fs from 'node:fs';
const html=appSource;
// M.13: the TV display is React. app/js/37-react-tv.js publishes what buildTV3ViewModel() (26-)
// chose, app/react/features/tv/ draws it (tests/golden/tv pins the result, recorded from the removed tv3
// renderer). Checks of TV markup point at that code.
const tvReact=readRepoFile('app/react/features/tv/Tv.tsx'),tvModel=readRepoFile('app/react/features/tv/tv-model.ts');
const checks=[
 ['clean root',tvReact.includes('<div className="tv3-root" data-testid="tv-canvas">')],
 ['single fixed grid',html.includes('grid-template-rows:210px 610px 260px!important')],
 ['header current upcoming rebalance',html.includes('grid-template-rows:210px 610px 260px!important')],
 ['vertical rules neutralized',html.includes('.tv3-root .white,body.ksm-tv .tv3-root .red{border-left:0!important;border-right:0!important}')],
 ['kachinuki bottom clearance',html.includes('padding-bottom:10px!important')],
 ['permanent upcoming',tvReact.includes('<div className="tv3-upcoming" data-testid="tv-upcoming">')],
 ['upcoming cards',tvReact.includes('className="tv3-up-card" data-testid="tv-upcoming-card"')&&tvReact.includes('className="tv3-up-card empty" data-testid="tv-upcoming-card"')],
 ['individual five columns',html.includes('grid-template-columns:520px 280px 120px 280px 520px!important')],
 ['team centered grid',html.includes('grid-template-columns:minmax(0,1fr) 110px minmax(0,1fr)!important')],
 ['kachinuki exactly three',html.includes('slice(0,3)')],
 ['new renderer emitted',/function renderTvDisplay\(\)\{[^}]*ksmRenderTv\(\);/.test(html)&&tvReact.includes('className="tv3-root"')],
 ['no tv2 emitted',!/innerHTML=`<div class="tv2-canvas/.test(html)],
];
let failed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
if(failed)process.exit(1);
console.log(`v3.15.14 TV zone-rebalance checks: ${checks.length}/${checks.length}`);
