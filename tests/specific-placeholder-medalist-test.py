from pathlib import Path
from ksm_source import app_source
s=app_source()
# M.8 step 5: the legacy court renderer is gone. The court screen is React: app/js/35-react-court.js
# makes the decisions and publishes them, app/react/court/ renders them (court_react_source());
# tests/golden/court/*.json pin the result. The court checks below point at that code.
checks={
 'specific label helper':'function specificMatchSideLabel(match,side)' in s,
 'championship source labels':'function championshipSideLabel(side,div)' in s,
 'queue uses specific white':"white:{name:ksmText(specificMatchSideLabel(m,'white'))" in s,
 'queue uses specific red':"red:{name:ksmText(specificMatchSideLabel(m,'red'))" in s,
 'single context uses helper':"specificMatchSideLabel(m,'white')" in s and "specificMatchSideLabel(m,'red')" in s,
 'medalist box removed':'.division-complete-row{display:grid;grid-template-columns:82px minmax(0,1fr);gap:16px;align-items:baseline;padding:8px 0;border:0' in s,
 'medalist name larger':'.division-complete-row span{font-size:26px' in s,
}
failed=[k for k,v in checks.items() if not v]
for k,v in checks.items(): print(('PASS' if v else 'FAIL'),k)
if failed: raise SystemExit(1)
print(f'{len(checks)}/{len(checks)} passed')
