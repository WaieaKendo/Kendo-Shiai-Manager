from pathlib import Path
html=Path('public/index.html').read_text()
checks={
 'version title':'Kendo Shiai Manager v3.11.8' in html,
 'landscape query':'@media (orientation:landscape) and (max-height:560px) and (max-width:980px)' in html,
 'results two columns':'#results .results-card-grid' in html and 'columns:2 280px !important' in html,
 'public centered width':'width:calc(100% - 20px) !important' in html and 'margin:10px auto 0 !important' in html,
 'canvas centered':'#public .audience-canvas' in html and 'margin-left:auto !important' in html,
 'compact hero':'#public .audience-hero' in html and 'padding:8px 14px 9px !important' in html,
 'desktop-like grid':'grid-template-columns:minmax(0,1fr) minmax(118px,.48fr) minmax(0,1fr) !important' in html,
 'smaller player text':'font-size:clamp(14px,2.6vw,21px) !important' in html,
 'smaller score':'font-size:31px !important' in html,
 'compact next match':'#public .audience-next-card' in html and 'padding:6px 13px !important' in html,
 'compact team current':'#public .team-live-row.current' in html and 'min-height:42px !important' in html,
}
failed=[k for k,v in checks.items() if not v]
for k,v in checks.items(): print(('PASS' if v else 'FAIL'),k)
if failed: raise SystemExit('Failed: '+', '.join(failed))
print(f'{len(checks)}/{len(checks)} passed')
