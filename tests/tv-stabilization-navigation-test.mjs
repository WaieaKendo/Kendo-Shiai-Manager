import { html as appSource, readRepoFile } from './lib/ksm-source.mjs';
import fs from "node:fs";
const html=appSource;
// M.13: the TV display is React. app/js/37-react-tv.js publishes what buildTV3ViewModel() (26-)
// chose, app/react/features/tv/ draws it (tests/golden/tv pins the result, recorded from the removed tv3
// renderer). Checks of TV markup point at that code.
const tvReact=readRepoFile('app/react/features/tv/Tv.tsx'),tvModel=readRepoFile('app/react/features/tv/tv-model.ts');
const checks=[
 ["fixed 1920 canvas",html.includes("width:1920px;height:1080px")],
 // The canvas wrapper is the tv3 root (the first renderer's scaled .tv-canvas and fitTvCanvas() never ran; removed in M.13).
 ["canvas wrapper",tvReact.includes('<div className="tv3-root" data-testid="tv-canvas">')&&html.includes("width:1920px;height:1080px")],
 ["court URL lock",html.includes("KSM_TV_ASSIGNED_COURT")&&html.includes("function tvAssignedCourt(){return KSM_TV_ASSIGNED_COURT}")],
 ["no portrait gate markup",!html.includes("id=\"tvRotate\"")],
 ["spectator TV hidden",html.includes("body.ksm-spectator .tv-role-access{display:none!important}")],
 ["TV nav role class",html.includes("nav-tile-wrap role-court-access tv-role-access")],
 ["search nav removed",!html.includes("title=\"Search\"")],
 ["search section removed",!html.includes("id=\"search\"")],
 ["overview label",html.includes("Tournament Overview")&&html.includes("<span>Overview</span>")]
];
let failed=0;for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"} ${name}`);if(!ok)failed++;}
console.log(`TV stabilization/navigation: ${checks.length-failed}/${checks.length}`);if(failed)process.exit(1);
