from pathlib import Path
from ksm_source import app_source, court_react_source
import re

root=Path(__file__).resolve().parents[1]
html=app_source()
react=court_react_source()
# M.8 step 5: the legacy court renderer is gone. The court screen is React: app/js/35-react-court.js
# makes the decisions and publishes them, app/react/features/court/ renders them (court_react_source());
# tests/golden/court/*.json pin the result. The court checks below point at that code.
checks={
 'landscape heading absolute center': '#score .scoreboard-heading-center{' in html and 'left:50% !important' in html and 'transform:translateX(-50%) !important' in html,
 'division centered': '#score .scoreboard-heading-center #scoreDiv{' in html and 'text-align-last:center !important' in html,
 'controls no reserved height': '#score .score-controls-grid{' in html and 'min-height:0 !important' in html and 'height:auto !important' in html,
 'panels no reserved height': '#score .control-panel{' in html and 'min-height:0 !important' in html and 'height:auto !important' in html,
 'global court context description removed': 'Current division status, pool standings, and bracket context.' not in html,
 'final team context uses sheet only': "return {kind:'team-sheet',sheet:ksmTeamSheet(m.division,m.teamPair,m)};" in html and "case 'team-sheet':\n      return (\n        <div className=\"team-sheet\">" in react,
 'final kachinuki context uses sheet only': "if(m.type==='kachinuki')return {kind:'kachinuki',sheet:ksmKachinukiSheet(m)};" in html and "case 'kachinuki':\n      return (\n        <div className=\"team-sheet\">" in react,
}
failed=[name for name,ok in checks.items() if not ok]
for name,ok in checks.items(): print(('PASS' if ok else 'FAIL')+': '+name)
if failed: raise SystemExit(f'{len(failed)} failures: '+', '.join(failed))
print(f'{len(checks)}/{len(checks)} checks passed')
