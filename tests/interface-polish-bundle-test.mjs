import fs from 'node:fs';
const html=fs.readFileSync('public/index.html','utf8');
const checks=[
 ['version 3.15.4',html.includes('v3.15.4')],
 ['validation header removed',!html.includes('<div class="results-modal-head"><h2 id="validationModalTitle"')],
 ['validation actions inset',html.includes('.validation-modal-actions')&&html.includes('justify-content:flex-end')],
 ['consistent results title size',html.includes('#results .summary-like > b')&&html.includes('font-size:16px')],
 ['results titles one line',html.includes('white-space:nowrap')&&html.includes('text-overflow:ellipsis')],
 ['next match stays gold',html.includes('#score .bottom-action-row .next-match-btn')&&html.includes('#dfa13a')],
 ['courts role access',html.includes('nav-tile-wrap role-court-access')],
 ['director role access',html.includes('nav-tile role-court-access')],
 ['restricted search hidden',html.includes('restricted-nav-extra')&&html.includes('body.ksm-spectator .restricted-nav-extra')],
 ['spectator director allowed',html.includes("!['score','public','results','director'].includes(id)")]
];
let failed=0; for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
console.log(`Interface polish bundle: ${checks.length-failed}/${checks.length} passed`); process.exit(failed?1:0);
