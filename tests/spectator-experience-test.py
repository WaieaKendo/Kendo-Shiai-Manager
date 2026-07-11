from pathlib import Path
html=Path('public/index.html').read_text()
checks={
 'version marker':'v3.10.7' in html,
 'portrait live scores media':'@media(max-width:600px) and (orientation:portrait)' in html,
 'compact audience court':'.audience-court{font-size:24px!important' in html,
 'mobile split names':'function audienceNameHtml(name)' in html and 'mobile-name-break' in html,
 'team current bout':'function teamCurrentBoutHtml(m)' in html and 'team-current-bout' in html,
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
