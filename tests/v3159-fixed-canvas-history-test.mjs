import fs from 'node:fs';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const checks=[
 ['fixed canvas',html.includes('width:1920px!important;height:1080px!important')&&html.includes('transform:none!important')],
 ['no automatic resize listener',!html.includes("window.addEventListener('resize',()=>{if(document.body.classList.contains('ksm-tv'))fitTvCanvas()})")],
 ['fixed red coordinate',html.includes('left:1142px!important;right:auto!important')],
 ['persistent court history',html.includes('courtActionHistory:{A:[],B:[]}')&&html.includes('KSM_HISTORY_LIMIT=100')],
 ['redo control',html.includes('id="redoBtn"')&&html.includes('function redo()')],
 ['next match atomic history',html.includes('performCourtAction(completedLabel')],
 ['team node placeholders',html.includes('tvTeamNodeEntries')&&html.includes('teamSideLabel(node.right,div)')],
 ['individual placeholder helper',html.includes('tvIndividualSideLabel')&&html.includes('Winner of ${prev?.round')],
 ['engine frozen',html.includes("engineVersion:'3.12.9'")]
];
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)process.exitCode=1}
console.log(`${checks.filter(x=>x[1]).length}/${checks.length} checks passed`);
