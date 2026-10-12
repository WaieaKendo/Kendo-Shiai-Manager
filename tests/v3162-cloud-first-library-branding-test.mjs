import { html as appSource } from './lib/ksm-source.mjs';
import fs from 'node:fs';
const html=appSource;
const worker=fs.readFileSync('src-worker.js','utf8');
const checks=[
 ['cloud library list endpoint', worker.includes("url.pathname === '/api/tournaments'") && worker.includes("url.pathname === '/library'")],
 ['cloud metadata updated after saves', worker.includes('await updateLibrary(await response.clone().json())')],
 ['local discovery migration', worker.includes("'/api/tournaments/discover'") && html.includes("'/api/tournaments/discover'")],
 ['new tournament immediately cloud-created', html.includes("showKsmToast('Creating tournament in cloud") && html.includes('await performCloudSave(tournamentPayload(),0)')],
 ['name below card', html.includes('home-card-name-below') && html.includes('home-tournament-item')],
 ['logo branding removed (v3.17.3)', !html.includes('handleTournamentLogoUpload') && !html.includes('removeTournamentLogo')],
 ['logo not stored in setup snapshot', !html.includes("'tournamentLogo','tName'")],
 ['pool selection fix retained', html.includes("poolViewDivision:'Women’s Open'") && html.includes('state.poolViewDivision=this.value;renderPools()')]
];
let failed=false; for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'}: ${n}`); if(!ok)failed=true;} process.exit(failed?1:0);
