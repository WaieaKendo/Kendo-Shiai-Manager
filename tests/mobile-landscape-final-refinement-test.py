from pathlib import Path
import re

html=Path(__file__).resolve().parents[1]/'public'/'index.html'
s=html.read_text()
checks={
 'version':'v3.12.3' in s,
 'landscape media':'@media (orientation:landscape) and (max-height:560px) and (max-width:980px)' in s,
 'live title center':'#public .audience-title' in s and 'grid-column:2 !important' in s,
 'court center':'#public .audience-court{justify-content:center !important;}' in s,
 'results grid':'grid-template-columns:repeat(2,minmax(0,1fr)) !important' in s and 'columns:auto !important' in s,
 'compact score match':'#score .scoreboard-match' in s and 'min-height:54px !important' in s,
 'single horizontal control band':'#score .score-controls-grid' in s and 'grid-template-columns:repeat(2,minmax(0,1fr)) !important' in s,
 'five buttons each':'#score .control-panel .sk-score-buttons' in s and 'grid-template-columns:repeat(5,minmax(0,1fr)) !important' in s,
 'compact score buttons':'height:48px !important' in s,
 'compact actions':'height:38px !important' in s,
}
for k,v in checks.items():
 print(('PASS' if v else 'FAIL'),k)
if not all(checks.values()): raise SystemExit(1)
print(f"{sum(checks.values())}/{len(checks)} passed")
