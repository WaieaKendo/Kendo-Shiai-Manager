from pathlib import Path
from ksm_source import APP, app_source, court_react_source
html=app_source()
react=court_react_source()
# M.13: Live Scores and the TV are React (app/react/live-scores/, app/react/tv/; tests/golden/
# live-scores and tests/golden/tv pin them). The audience-hero helpers these checks used to read
# (audienceNameHtml(), audienceIndividualHero(), standardTeamAudienceHtml(), kachinukiAudienceHtml(),
# ... in 25-/31-) were never called and were removed with the legacy TV renderer; the Live Scores
# checks below point at the code that draws Live Scores (a team match: the court screen's team
# sheet, ContextPanel) and the TV. "mobile split names" is gone: only the never-called
# audienceNameHtml() split names for phones; Live Scores shows a name on one line (pinned by
# tests/golden/live-scores, phone portrait and landscape).
live=(APP/'react'/'live-scores'/'LiveScores.tsx').read_text(encoding='utf-8')
tv=(APP/'react'/'tv'/'Tv.tsx').read_text(encoding='utf-8')
# M.8 step 5: the legacy court renderer is gone. The court screen is React: app/js/35-react-court.js
# makes the decisions and publishes them, app/react/court/ renders them (court_react_source());
# tests/golden/court/*.json pin the result. The court checks below point at that code.
checks={
 'portrait live scores media':'@media(max-width:600px) and (orientation:portrait)' in html,
 'compact audience court':'.audience-court{font-size:24px!important' in html,
 'no duplicate team current panel':'function teamCurrentBoutHtml(m)' not in html and 'team-current-bout' not in html,
 'current bout stays in lineup':"return ksmAlignedRow(match,{wp:pts.W,rp:pts.R,status,current:match===currentMatch});" in html and '{view.rows.map((r, i) => <AlignedRow key={i} row={r} />)}' in react and "className={`tv3-team-row${row.active ? ' active' : ''}`}" in tv and 'teamCurrentBoutHtml' not in html,
 'active lineup row enlarged':'.team-live-row.current .team-live-player{font-size:14px!important}' in html and '.team-live-row.current .team-point-slot{width:30px!important;height:30px!important;font-size:18px!important}' in html,
 'active lineup gold outline no tint':'.team-live-row.current{' in html and 'background:transparent;' in html and 'box-shadow:inset 0 0 0 2px rgba(224,164,60,.78)' in html,
 'red point slots centered':'.team-point-slot.red{' in html and 'padding-right:0;' in html and 'text-align:center;' in html and 'justify-content:center;' in html,
 'active mobile point slots separated':'.team-live-row.current>.team-point-slot:nth-child(2){transform:translateX(-17px)}' in html and '.team-live-row.current>.team-point-slot:nth-child(3){transform:translateX(17px)}' in html and '.team-live-row.current>.team-point-slot:nth-child(5){transform:translateX(-17px)}' in html and '.team-live-row.current>.team-point-slot:nth-child(6){transform:translateX(17px)}' in html,
 'mobile view top spacing':'#registration,#score,#director,#search,#print{padding-top:12px!important}' in html,
 # Owner decision 5 (#29): the team sheet is followed by the current bout's hansoku (BoutHansoku).
 'team lineup retained':"case 'team': return <><ContextPanel view={{ kind: 'team-sheet', ...body.sheet }} /><BoutHansoku hansoku={body.hansoku} /></>;" in live and "rows:matches.map(match=>{" in html,
 'next match retained':'<div className="live-next">' in live and '<span>Next</span>' in live and '<div className="tv3-upcoming-title">{footer.title ?? UPCOMING_TITLE}</div>' in tv,  # decision 6: or "Up next on this court"
 'pool completion helper':'function poolDisplayComplete(div,label)' in html,
 'incomplete pools before bracket':'Pools In Progress' in react and react.index('Pools In Progress') < react.index('Championship Bracket Preview', react.index('export function CourtContext')) and "return {kind:'pools',inProgress,bracket:ksmBracket(div),completed:done};" in html,
 'completed checkmark':'pool-complete-mark' in html and 'className="pool-complete-mark" data-testid="context-pool-complete" aria-label="Complete">{icons.poolComplete}' in react and "poolComplete: '✓'" in react,
 'alphabetical pool ordering':'.sort((a,b)=>String(a.label).localeCompare(String(b.label)))' in html,
 'render context shared rule':'return ksmPoolContext(m.division,m);' in html and 'return ksmPoolContext(div,null);' in html,
 'landscape live score media':'@media(orientation:landscape) and (max-height:560px) and (max-width:980px)' in html,
 'no engine schema change':'const state={brackets:' in html,
}
failed=[name for name,ok in checks.items() if not ok]
for name,ok in checks.items(): print(('PASS' if ok else 'FAIL')+': '+name)
if failed: raise SystemExit(1)
print(f'PASS: {len(checks)}/{len(checks)} spectator experience assertions.')
