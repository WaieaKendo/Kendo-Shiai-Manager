"""Render any registered print document against the local built worker."""
import argparse
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tests'))
from ksm_browser import launch_chromium
from ksm_server import local_worker
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('document')
parser.add_argument('--out', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
# Ask the shared registry, never interpolate an unchecked path into the browser URL.
import subprocess
names = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', "import {printDocuments} from './app/print-documents.mjs'; console.log(JSON.stringify(Object.keys(printDocuments)))"], cwd=root))
if args.document not in names:
    parser.error(f'Unknown document. Choose: {names}')
out = args.out or root / 'dist' / 'print' / f'{args.document}.pdf'
with local_worker() as base, sync_playwright() as p:
    browser = launch_chromium(p)
    page = browser.new_page()
    response = page.goto(f'{base}/print/{args.document}', wait_until='networkidle')
    assert response.status == 200
    page.evaluate('document.fonts.ready')
    assert page.locator('img').evaluate_all('(images) => images.every(i => i.complete && i.naturalWidth > 0)')
    out.parent.mkdir(parents=True, exist_ok=True)
    page.pdf(path=str(out), format='Letter', print_background=True)
    browser.close()
print(out)
