from pathlib import Path
html=Path('public/index.html').read_text()
checks={
  'version title':'Kendo Shiai Manager v3.12.0' in html,
  'version badge':'<span class="version-badge">v3.12.0</span>' in html,
  'portrait safe area':'padding-top:calc(12px + env(safe-area-inset-top)) !important' in html,
  'fixed icon rows':'grid-template-rows:36px 26px !important' in html,
  'icon row assignment':'grid-row:1 !important' in html,
  'label row assignment':'grid-row:2 !important' in html,
  'landscape brand reserve':'grid-template-columns:160px minmax(0,1fr) !important' in html,
  'brand width protected':'min-width:160px !important' in html,
  'nav shifted right':'padding-left:8px !important' in html,
  'first item gap':'margin-left:4px !important' in html,
}
failed=[k for k,v in checks.items() if not v]
for k,v in checks.items(): print(('PASS' if v else 'FAIL'),k)
if failed: raise SystemExit(1)
print(f'PASS: {len(checks)}/{len(checks)} final mobile navigation checks')
