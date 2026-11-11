"""Where Python tests find the KSM app: its source and the built site.

The app is written in app/ and built by Vite into dist/ (see scripts/app-sources.mjs):

    app_source()  the source as ONE plain text, for checks that read the code: app/index.html,
                  app/styles/*.css, app/modules/**/*.js (sorted by path) and app/js/*.js, each file
                  as it is on disk, nothing transformed. Same as tests/lib/ksm-source.mjs `html`.
    app_html()    the built dist/index.html, for load_app(page, html).
    court_react_source() the React court screen (app/react/features/court/*.ts, *.tsx) as one text, for
                  checks of court markup that React renders (roadmap M.8).
    ensure_built() rebuilds dist/ when it is missing or older than app/ (run-all builds first).
"""
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'app'
DIST = ROOT / 'dist'


def _read_all(folder, ext):
    return ''.join(f.read_text(encoding='utf-8') for f in sorted((APP / folder).glob(f'*{ext}')))


def app_source():
    modules = ''.join(f.read_text(encoding='utf-8') for f in sorted((APP / 'modules').rglob('*.js'), key=lambda f: f.relative_to(APP / 'modules').as_posix()))
    return '\n'.join([(APP / 'index.html').read_text(encoding='utf-8'), _read_all('styles', '.css'), modules, _read_all('js', '.js')])


def court_react_source():
    dirs = [APP / 'react' / 'features' / 'court', APP / 'react' / 'shared' / 'ui']  # shared/ui held court/'s pieces before the split
    return ''.join(f.read_text(encoding='utf-8') for d in dirs for f in sorted(d.glob('*.ts*')))


def ensure_built():
    built = DIST / 'index.html'
    sources = [ROOT / 'vite.config.js', ROOT / 'scripts' / 'app-sources.mjs', ROOT / 'package.json', *(f for f in APP.rglob('*') if f.is_file())]
    if built.exists() and built.stat().st_mtime >= max(f.stat().st_mtime for f in sources):
        return
    subprocess.run(['npm', 'run', '--silent', 'build'], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)


def app_html():
    ensure_built()
    return (DIST / 'index.html').read_text(encoding='utf-8')
