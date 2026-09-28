from pathlib import Path
from ksm_source import app_source, court_react_source
html=app_source()
# The team bracket's Wins/Points column labels: teamResultsBracketHtml() (28-) drew them until the
# Results modal moved to React (M.13); since then the court screen's Bracket component draws them
# (app/react/court/CourtContext.tsx: the court context and the Results bracket modal).
react=court_react_source()
checks={
 'medal badge background removed':'.division-complete-row b.gold,.division-complete-row b.silver,.division-complete-row b.bronze{background:transparent!important' in html,
 'team metric header present':'team-round-metric-head' in html and 'className="team-round-metric-head"' in react,
 'white wins label':'white-wins">Wins' in react,
 'white points label':'white-points">Points' in react,
 'red wins label':'red-wins">Wins' in react,
 'red points label':'red-points">Points' in react,
 'single column team context':'#courtContext .results-team-bracket{grid-template-columns:minmax(0,1fr)!important}' in html,
}
failed=[k for k,v in checks.items() if not v]
print(f"final medal/team context polish: {len(checks)-len(failed)}/{len(checks)}")
if failed:
    print('FAILED:', failed)
    raise SystemExit(1)
