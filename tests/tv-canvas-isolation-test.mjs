import fs from 'node:fs';
const html=fs.readFileSync('public/index.html','utf8');
const checks=[
 ['isolated TV rule',html.includes('isolated fixed-coordinate TV presentation canvas')||html.includes('fixed picture-like TV canvas')],
 ['TV route fixed 1920 canvas',html.includes('body.ksm-tv main>#tv')&&html.includes('width:1920px!important;height:1080px!important')],
 ['browser zoom controls scaling',html.includes('transform:none!important')&&!html.includes('Math.min(viewportWidth/1920,viewportHeight/1080)')],
 ['fixed 1920 by 1080 canvas',html.includes('width:1920px!important;height:1080px!important')],
 ['header is inside canvas coordinates',html.includes('top:34px!important;height:184px!important')],
 ['match has fixed coordinate zone',html.includes('top:244px!important')&&html.includes('width:1792px!important;height:500px!important')],
 ['red side uses explicit left coordinate',html.includes('left:1142px!important;right:auto!important')],
 ['upcoming has fixed coordinate zone',html.includes('top:776px!important;height:270px!important')],
 ['fit function does not resize host dimensions',!html.includes("tvLive.style.width=(1920*safe)+'px'")]
];
let failed=0;for(const [name,ok] of checks){console.log(`${ok?'✓':'✗'} ${name}`);if(!ok)failed++;}
if(failed)process.exit(1);console.log(`${checks.length}/${checks.length} TV canvas isolation checks passed.`);
