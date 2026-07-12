from pathlib import Path
s=Path('public/index.html').read_text()
checks={
'live scores icon baseline':'aria-controls="liveScoresMenu"] img' in s and 'translateY(2px)' in s,
'shared brand selectors':'.scoreboard-tournament,\n.audience-tournament' in s,
'tournament wraps':'overflow-wrap:break-word' in s and 'white-space:normal' in s,
'left aligned brand':'text-align:left !important' in s,
'balanced court rules':'grid-template-columns:minmax(36px,1fr) auto minmax(36px,1fr)' in s,
'version':'v3.11.8' in s,
}
for k,v in checks.items(): print(('PASS' if v else 'FAIL'),k)
assert all(checks.values())
