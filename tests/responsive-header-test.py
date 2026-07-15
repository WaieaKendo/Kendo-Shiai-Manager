from pathlib import Path
import re

root=Path(__file__).resolve().parents[1]
html=(root/'public/index.html').read_text()
checks={
  'version title':'Kendo Shiai Manager v3.15.2' in html,
  'version badge':'v3.15.2</span>' in html,
  'shared brand selectors':'.scoreboard-tournament,\n.audience-tournament' in html,
  'smaller header font':'font-size:12px !important' in html,
  'two line clamp':'-webkit-line-clamp:2 !important' in html,
  'word safe wrap':'word-break:normal !important' in html and 'hyphens:none !important' in html,
  'brand width bound':'max-width:260px !important' in html,
  'landscape brand bound':'max-width:150px !important' in html,
  'court title protected':'grid-template-columns:minmax(150px,.82fr) minmax(280px,1.25fr) minmax(110px,.72fr)' in html,
  'shared mobile rules':'#scoreTournamentName,\n  .audience-tournament span' in html,
}
failed=[k for k,v in checks.items() if not v]
for k,v in checks.items(): print(('PASS' if v else 'FAIL'),k)
if failed: raise SystemExit('failed: '+', '.join(failed))
print(f'{len(checks)}/{len(checks)} checks passed')
