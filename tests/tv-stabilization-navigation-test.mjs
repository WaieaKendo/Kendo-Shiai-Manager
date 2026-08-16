import fs from "node:fs";
const html=fs.readFileSync("public/index.html","utf8");
const checks=[
 ["v3.15.8 marker",html.includes("v3.15.8")],
 ["fixed 1920 canvas",html.includes("width:1920px;height:1080px")],
 ["scaled canvas wrapper",html.includes("class=\"tv-canvas\"")&&html.includes("fitTvCanvas")],
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
