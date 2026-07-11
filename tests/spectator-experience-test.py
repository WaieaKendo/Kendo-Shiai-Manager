from pathlib import Path
html=Path('public/index.html').read_text()
checks={
 'version marker':'v3.10.9' in html,
 'portrait live scores media':'@media(max-width:600px) and (orientation:portrait)' in html,
 'compact audience court':'.audience-court{font-size:24px!important' in html,
 'mobile split names':'function audienceNameHtml(name)' in html and 'mobile-name-break' in html,
 'no duplicate team current panel':'function teamCurrentBoutHtml(m)' not in html and 'team-current-bout' not in html,
 'current bout stays in lineup':'<div class="team-lineup">${rows}</div>' in html and '${teamCurrentBoutHtml(m)}' not in html,
 'active lineup row enlarged':'.team-live-row.current .team-live-player{font-size:14px!important}' in html and '.team-live-row.current .team-point-slot{width:30px!important;height:30px!important;font-size:18px!important}' in html,
 'active lineup gold outline no tint':'.team-live-row.current{' in html and 'background:transparent;' in html and 'box-shadow:inset 0 0 0 2px rgba(224,164,60,.78)' in html,
 'red point slots centered':'.team-point-slot.red{' in html and 'padding-right:0;' in html and 'text-align:center;' in html and 'justify-content:center;' in html,
 'active mobile point slots separated':'.team-live-row.current>.team-point-slot:nth-child(2){transform:translateX(-17px)}' in html and '.team-live-row.current>.team-point-slot:nth-child(3){transform:translateX(17px)}' in html and '.team-live-row.current>.team-point-slot:nth-child(5){transform:translateX(-17px)}' in html and '.team-live-row.current>.team-point-slot:nth-child(6){transform:translateX(17px)}' in html,
 'mobile view top spacing':'#registration,#score,#director,#search,#print{padding-top:12px!important}' in html,
 'team lineup retained':'<div class="team-lineup">${rows}</div>' in html,
 'next match retained':'audience-next-label">Next Match' in html,
 'pool completion helper':'function poolDisplayComplete(div,label)' in html,
 'incomplete pools before bracket':'Pools In Progress' in html and html.index('Pools In Progress') < html.index('Championship Bracket Preview', html.index('function orderedPoolContextHtml')),
 'completed checkmark':'pool-complete-mark' in html and 'aria-label="Complete">✓' in html,
 'alphabetical pool ordering':'.sort((a,b)=>String(a.label).localeCompare(String(b.label)))' in html,
 'render context shared rule':'courtContext.innerHTML=orderedPoolContextHtml(m.division,m)' in html,
 'landscape live score media':'@media(orientation:landscape) and (max-height:560px) and (max-width:980px)' in html,
 'no engine schema change':'const state={brackets:' in html,
}
failed=[name for name,ok in checks.items() if not ok]
for name,ok in checks.items(): print(('PASS' if ok else 'FAIL')+': '+name)
if failed: raise SystemExit(1)
print(f'PASS: {len(checks)}/{len(checks)} spectator experience assertions.')
