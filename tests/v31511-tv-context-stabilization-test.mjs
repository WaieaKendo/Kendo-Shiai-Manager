import fs from 'node:fs';
const html=fs.readFileSync(new URL('../public/index.html', import.meta.url),'utf8');
const checks=[
 ['version marker',html.includes('v3.15.12</span>')],
 ['shared current zone',html.includes('.tv-kachinuki-main')&&html.includes('top:226px!important')],
 ['persistent upcoming footer',html.includes('top:748px!important')&&html.includes('grid-template-rows:114px 114px')],
 ['kachinuki renderer',html.includes('function tvKachinukiHtml(court,data)')],
 ['kachinuki current above lineup',html.includes('tv-kachinuki-current')&&html.indexOf('tv-kachinuki-current')<html.indexOf('tv-kachinuki-lineups')],
 ['three fighter lineups',html.includes("slice(0,3)")],
 ['status only lineup',html.includes("?'eliminated':(index===activeIndex?'active':'waiting')")],
 ['no kachinuki summary in renderer',!html.match(/function tvKachinukiHtml[\s\S]*?tv-team-summary[\s\S]*?function tvTeamHtml/)],
 ['kachinuki uses team upcoming',html.includes('${tvUpcomingHtml(court,m,true)}')],
 ['render routes kachinuki to team context',html.includes("m.type==='teamPosition'||m.type==='teamPlayoff'||m.type==='kachinuki'")],
 ['centered standard teams',html.includes('grid-template-columns:820px 820px!important')&&html.includes('column-gap:100px!important')],
];
for(const [name,ok] of checks){if(!ok){console.error('FAIL',name);process.exitCode=1}else console.log('PASS',name)}
if(!process.exitCode)console.log(`v3.15.12 checks passed: ${checks.length}/${checks.length}`);
