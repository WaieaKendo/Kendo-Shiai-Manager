from pathlib import Path
s=Path('public/index.html').read_text()
checks={
 'specific label helper':'function specificMatchSideLabel(match,side)' in s,
 'championship source labels':'function championshipSideLabel(side,div)' in s,
 'queue uses specific white':"const white=specificMatchSideLabel(m,'white')" in s,
 'queue uses specific red':"const red=specificMatchSideLabel(m,'red')" in s,
 'single context uses helper':"specificMatchSideLabel(m,'white')" in s and "specificMatchSideLabel(m,'red')" in s,
 'medalist box removed':'.division-complete-row{display:grid;grid-template-columns:82px minmax(0,1fr);gap:16px;align-items:baseline;padding:8px 0;border:0' in s,
 'medalist name larger':'.division-complete-row span{font-size:26px' in s,
 'version':'v3.15.0' in s,
}
failed=[k for k,v in checks.items() if not v]
for k,v in checks.items(): print(('PASS' if v else 'FAIL'),k)
if failed: raise SystemExit(1)
print(f'{len(checks)}/{len(checks)} passed')
