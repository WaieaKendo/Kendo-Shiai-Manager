"""Where Python tests find the KSM app: its source and the built site.

The app is written in app/ and built by Vite into dist/ (see scripts/app-sources.mjs):

    app_source()  the source as ONE text, as index.html was before the split: app/index.html
                  with app/styles/*.css and app/js/*.js (each in file-name order) inlined.
                  For checks that read the code. Same as tests/lib/ksm-source.mjs `html`.
    app_html()    the built dist/index.html, for load_app(page, html).
    court_react_source() the React court screen (app/react/court/*.ts, *.tsx) as one text, for
                  checks of court markup that React renders (roadmap M.8).
    ensure_built() rebuilds dist/ when it is missing or older than app/ (run-all builds first).
"""
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'app'
DIST = ROOT / 'dist'
STYLE_TAG = '<link rel="stylesheet" href="/app.css">'
SCRIPT_TAG = '<script src="/app.js"></script>'


def _read_all(folder, ext):
    return ''.join(f.read_text(encoding='utf-8') for f in sorted((APP / folder).glob(f'*{ext}')))


def app_source():
    html = (APP / 'index.html').read_text(encoding='utf-8')
    html = html.replace(STYLE_TAG, '<style>\n' + _read_all('styles', '.css') + '</style>', 1)
    return html.replace(SCRIPT_TAG, '<script>\n' + _read_all('js', '.js') + '</script>', 1)


def court_react_source():
    return ''.join(f.read_text(encoding='utf-8') for f in sorted((APP / 'react' / 'court').glob('*.ts*')))


def ensure_built():
    built = DIST / 'index.html'
    sources = [ROOT / 'vite.config.js', ROOT / 'scripts' / 'app-sources.mjs', ROOT / 'package.json', *(f for f in APP.rglob('*') if f.is_file())]
    if built.exists() and built.stat().st_mtime >= max(f.stat().st_mtime for f in sources):
        return
    subprocess.run(['npm', 'run', '--silent', 'build'], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)


def app_html():
    ensure_built()
    return (DIST / 'index.html').read_text(encoding='utf-8')
