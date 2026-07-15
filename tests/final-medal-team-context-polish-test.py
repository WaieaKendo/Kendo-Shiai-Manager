from pathlib import Path
html=Path('public/index.html').read_text()
checks={
 'version':'v3.15.1' in html,
 'medal badge background removed':'.division-complete-row b.gold,.division-complete-row b.silver,.division-complete-row b.bronze{background:transparent!important' in html,
 'team metric header present':'team-round-metric-head' in html,
 'white wins label':'white-wins">Wins' in html,
 'white points label':'white-points">Points' in html,
 'red wins label':'red-wins">Wins' in html,
 'red points label':'red-points">Points' in html,
 'single column team context':'#courtContext .results-team-bracket{grid-template-columns:minmax(0,1fr)!important}' in html,
}
failed=[k for k,v in checks.items() if not v]
print(f"final medal/team context polish: {len(checks)-len(failed)}/{len(checks)}")
if failed:
    print('FAILED:', failed)
    raise SystemExit(1)
