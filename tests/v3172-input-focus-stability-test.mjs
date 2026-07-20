import fs from 'node:fs';
const html=fs.readFileSync('public/index.html','utf8');
const checks=[
  ['version badge',html.includes('v3.17.2-test')],
  ['calm local autosave',html.includes("setTimeout(()=>autoSaveTournament(reason),2000)")],
  ['calm cloud debounce',html.includes("scheduleCloudSave(reason='Autosave',delay=1200)")],
  ['self-originated echo ignored',html.includes('record.updatedBy?.clientId&&record.updatedBy.clientId===cloudSession.clientId')],
  ['editing detection present',html.includes('function activeEditorHasFocus()')],
  ['remote updates deferred during staff editing',html.includes("ksmSessionRole==='staff'&&activeEditorHasFocus()")],
  ['deferred updates applied after focusout',html.includes("document.addEventListener('focusout'") && html.includes('applyDeferredRemoteRecord')]
];
let failed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
if(failed)process.exit(1);
