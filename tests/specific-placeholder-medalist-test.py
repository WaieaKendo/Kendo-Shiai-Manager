from pathlib import Path
from ksm_source import app_source, court_react_source
s=app_source()
react=court_react_source()
# M.8 step 5: the legacy court renderer is gone. The court screen is React: app/js/35-react-court.js
# makes the decisions and publishes them, app/react/features/court/ renders them (court_react_source());
# tests/golden/court/*.json pin the result. The court checks below point at that code. #136 step 2: the queue
# builders moved into the court module (publish.ts).
checks={
 'specific label helper':'function specificMatchSideLabel(match,side)' in s,
 'championship source labels':'function championshipSideLabel(side,div)' in s,
 'queue uses specific white':"white: { name: text(legacy('specificMatchSideLabel')(m, 'white'))" in react,
 'queue uses specific red':"red: { name: text(legacy('specificMatchSideLabel')(m, 'red'))" in react,
 'single context uses helper':"legacy('specificMatchSideLabel')(m, 'white')" in react and "legacy('specificMatchSideLabel')(m, 'red')" in react,
 'medalist box removed':'.division-complete-row{display:grid;grid-template-columns:82px minmax(0,1fr);gap:16px;align-items:baseline;padding:8px 0;border:0' in s,
 'medalist name larger':'.division-complete-row span{font-size:26px' in s,
}
failed=[k for k,v in checks.items() if not v]
for k,v in checks.items(): print(('PASS' if v else 'FAIL'),k)
if failed: raise SystemExit(1)
print(f'{len(checks)}/{len(checks)} passed')
