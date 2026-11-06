"""Where Python tests find the KSM app: its source and the built site.

The app is written in app/ and built by Vite into dist/ (see scripts/app-sources.mjs):

    app_source()  the source as ONE text, as index.html was before the split: app/index.html
                  with app/styles/*.css and app/js/*.js (each in file-name order) inlined; the
                  app/modules the entry imports come first, in import order, with `import` lines
                  removed and `export ` dropped (scripts/app-sources.mjs classicAppScript()).
                  For checks that read the code. Same as tests/lib/ksm-source.mjs `html`.
    app_html()    the built dist/index.html, for load_app(page, html).
    court_react_source() the React court screen (app/react/features/court/*.ts, *.tsx) as one text, for
                  checks of court markup that React renders (roadmap M.8).
    ensure_built() rebuilds dist/ when it is missing or older than app/ (run-all builds first).
"""
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'app'
DIST = ROOT / 'dist'
STYLE_TAG = '<link rel="stylesheet" href="/app.css">'
SCRIPT_TAG = '<script type="module" src="/app.js"></script>'


def _read_all(folder, ext):
    return ''.join(f.read_text(encoding='utf-8') for f in sorted((APP / folder).glob(f'*{ext}')))


_IMPORT_LINE = re.compile(r"^import \{([^}]*)\} from '([^']+)';?[ \t]*\r?\n", re.M)
_EXPORT = re.compile(r'^export (?=(?:async\s+)?function\b|const\b|let\b|class\b)', re.M)
_UNSUPPORTED = re.compile(r'''^\s*(?:import\s*[\w{*'"]|export\s+(?:\{|\*|default))''', re.M)


def classic_app_script():
    """The entry (app/js) plus the modules it imports as one classic script; same output as
    classicAppScript() in scripts/app-sources.mjs (tests/classic-source-parity-test.mjs compares them)."""
    done, out = set(), []

    def strip(file, text):
        if _UNSUPPORTED.search(_IMPORT_LINE.sub('', text)):
            raise ValueError(f"{file}: only single-line import {{a,b}} from '...'; and export function|const|let|class are supported")
        for m in _IMPORT_LINE.finditer(text):
            visit((file.parent / m.group(2)).resolve())
        return _IMPORT_LINE.sub('', text)

    def visit(file):
        if file in done:
            return
        done.add(file)
        out.append(_EXPORT.sub('', strip(file, file.read_text(encoding='utf-8'))))

    entry = ''.join(strip(f, f.read_text(encoding='utf-8')) for f in sorted((APP / 'js').glob('*.js')))
    return ''.join(out) + entry


def app_source():
    html = (APP / 'index.html').read_text(encoding='utf-8')
    html = html.replace(STYLE_TAG, '<style>\n' + _read_all('styles', '.css') + '</style>', 1)
    return html.replace(SCRIPT_TAG, '<script>\n' + classic_app_script() + '</script>', 1)


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
