import { html as appSource } from './lib/ksm-source.mjs';
import fs from 'node:fs';
const html=appSource;
const checks=[
  ['calm local autosave',html.includes("setTimeout(()=>{ksmSaveTimer=null;autoSaveTournament(reason)},2000)")],
  ['calm cloud debounce',html.includes("scheduleCloudSave(reason='Autosave',delay=1200)")],
  ['self-originated echo ignored',html.includes('record.updatedBy?.clientId&&record.updatedBy.clientId===/* ksm:post-split-begin two-tabs was:cloudSession.clientId */ksmWriterId()')],
  ['editing detection present',html.includes('function activeEditorHasFocus()')],
  ['remote updates deferred during staff editing',html.includes("ksmSessionRole==='staff'&&(activeEditorHasFocus()||recentEditorActivity())")],
  ['deferred updates applied after focusout',html.includes("document.addEventListener('focusout'") && html.includes('applyDeferredRemoteRecord')]
];
let failed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
if(failed)process.exit(1);
