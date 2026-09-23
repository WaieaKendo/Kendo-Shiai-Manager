from pathlib import Path
import re

root=Path(__file__).resolve().parents[1]
html=(root/'public/index.html').read_text()
checks={
 'landscape heading absolute center': '#score .scoreboard-heading-center{' in html and 'left:50% !important' in html and 'transform:translateX(-50%) !important' in html,
 'division centered': '#score .scoreboard-heading-center #scoreDiv{' in html and 'text-align-last:center !important' in html,
 'controls no reserved height': '#score .score-controls-grid{' in html and 'min-height:0 !important' in html and 'height:auto !important' in html,
 'panels no reserved height': '#score .control-panel{' in html and 'min-height:0 !important' in html and 'height:auto !important' in html,
 'global court context description removed': 'Current division status, pool standings, and bracket context.' not in html,
 'final team context uses sheet only': 'courtContext.innerHTML=teamSheetHtml(m.division,m.teamPair,m);return;' in html,
 'final kachinuki context uses sheet only': 'courtContext.innerHTML=kachinukiSheetHtml(m);return;' in html,
}
failed=[name for name,ok in checks.items() if not ok]
for name,ok in checks.items(): print(('PASS' if ok else 'FAIL')+': '+name)
if failed: raise SystemExit(f'{len(failed)} failures: '+', '.join(failed))
print(f'{len(checks)}/{len(checks)} checks passed')
