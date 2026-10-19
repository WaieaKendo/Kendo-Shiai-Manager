"""Tests reach the app's internals only through the test API (issue #61).

The store refactor (#15) replaces the app's globals (`state`, the sync variables, the render and
engine functions). A test that names one of them inside a `page.evaluate(...)` script would break
silently or, worse, keep passing against a stale name. So the scripts a test sends to the page may
touch the app through `KSMTest` (tests/lib/ksm-test-api.js) only: named operations, or the
`KSMTest.app.<name>` gateway for the few internals a test still needs.

This test reads every Python test file (no browser), finds the JavaScript handed to
evaluate / wait_for_function / add_init_script / ... (string literals in the call, including
module-level constants the call passes by name) and fails when a script uses an app global
(top-level function, let/const/var of app/js/*.js) directly. tests/ksm_app.py is the test API
and is exempt. ALLOWED lists the remaining justified cases, each with its reason; a stale entry
(no longer needed) also fails, so the list cannot rot.
"""
import ast
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TESTS = ROOT / 'tests'

# (test file, identifier): why the script may still use it directly.
ALLOWED = {
    ('path-urls-test.py', 'state'): 'checks the overlay page does NOT load the app (typeof state is undefined); '
                                    'KSMTest does not exist on that page either',
    ('inline-handler-injection-test.py', 'setDivisionCourt'): 'spies on the window-level name an inline onclick="setDivisionCourt(..)" '
                                                              'resolves; the test is about inline handlers themselves',
    ('inline-handler-injection-test.py', 'showDojoProfile'): 'same: replaces the window-level handler an inline onclick calls, '
                                                             'to prove a hostile name cannot break out of the argument',
}

CALLS = {'evaluate', 'evaluate_handle', 'wait_for_function', 'eval_on_selector', 'eval_on_selector_all',
         'add_init_script', 'expose_function', 'expose_binding'}
EXEMPT_FILES = {'ksm_app.py', 'test-api-boundary-test.py'}
# Words that are app globals but also ordinary words; they only count when called or assigned.
WEAK = {'show', 'hansoku', 'point', 'undo', 'redo', 'render', 'print'}


def app_globals():
    names = set()
    for f in (ROOT / 'app' / 'js').glob('*.js'):
        s = f.read_text(encoding='utf-8')
        names |= set(re.findall(r'^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)', s, re.M))
        names |= set(re.findall(r'^(?:let|const|var)\s+([A-Za-z_$][\w$]*)', s, re.M))
    return {n for n in names if len(n) > 2} | {'state'}


def build_pattern(names):
    alt = '|'.join(sorted(map(re.escape, names), key=len, reverse=True))
    # A bare identifier: not a property (.x), not part of a data-testid / CSS / path word (x-, -x, /x, #x).
    return re.compile(r'(?<![\w$.\-\'"/#])(' + alt + r')(?![\w$\-\'"])|\bwindow\.(' + alt + r')\b')


def is_reference(text, m):
    """Whether the match is a use of the app global (not an object key such as `{state: 1}`, and a
    word like `show` only when called or assigned)."""
    name = m.group(1) or m.group(2)
    after = text[m.end():]
    if m.group(1):
        before = text[:m.start()].rstrip()
        if re.match(r'\s*:(?!:)', after) and before[-1:] in ('{', ','):
            return False
    if name in WEAK and not re.match(r'\s*(\(|=(?!=))', after):
        return False
    return True


def strings_in(node, constants):
    """String literals under `node`, following names bound to module-level string constants."""
    out = []
    for sub in ast.walk(node):
        if isinstance(sub, ast.Constant) and isinstance(sub.value, str):
            out.append((sub.value, sub.lineno))
        elif isinstance(sub, ast.Name) and sub.id in constants:
            out.append(constants[sub.id])
    return out


def module_constants(tree):
    consts = {}
    for stmt in tree.body:
        if isinstance(stmt, ast.Assign) and len(stmt.targets) == 1 and isinstance(stmt.targets[0], ast.Name):
            parts = [(c.value, c.lineno) for c in ast.walk(stmt.value) if isinstance(c, ast.Constant) and isinstance(c.value, str)]
            if parts:
                consts[stmt.targets[0].id] = ('\n'.join(p[0] for p in parts), parts[0][1])
    return consts


def violations(source, pattern, filename='<test>'):
    tree = ast.parse(source)
    consts = module_constants(tree)
    found = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr in CALLS:
            for text, line in strings_in(node, consts):
                for m in pattern.finditer(text):
                    if is_reference(text, m):
                        found.setdefault(m.group(1) or m.group(2), line)
    return found


def main():
    pattern = build_pattern(app_globals())
    problems = []

    # Self-check: the scanner flags a direct internal and passes the gateway.
    assert violations("page.evaluate('state.competitors.length')", pattern) == {'state': 1}
    assert violations("page.evaluate('() => renderAll()')", pattern) == {'renderAll': 1}
    assert not violations("page.evaluate('KSMTest.app.state.competitors.length')", pattern)
    assert not violations("page.evaluate('() => document.querySelector(\"[data-testid=x]\").dataset.state')", pattern)
    assert not violations("page.evaluate('({state: 1}).state')", pattern)

    # Every KSMTest.app.<name> a test uses is defined in the test API (a typo would only fail when that test runs).
    api = (TESTS / 'lib' / 'ksm-test-api.js').read_text(encoding='utf-8')
    defined = set(re.findall(r'^    (?:get )?([A-Za-z_$][\w$]*)(?:\(\)|:)', api[api.index('  app: {'):api.index('  // --- Bulk setup')], re.M))
    for f in sorted(TESTS.glob('*.py')):
        for name in sorted(set(re.findall(r'KSMTest\.app\.([A-Za-z_$][\w$]*)', f.read_text(encoding='utf-8'))) - defined):
            problems.append(f'{f.name}: KSMTest.app.{name} is not defined in tests/lib/ksm-test-api.js')

    used = set()
    for f in sorted(TESTS.glob('*.py')):
        if f.name in EXEMPT_FILES:
            continue
        for name, line in violations(f.read_text(encoding='utf-8'), pattern, f.name).items():
            if (f.name, name) in ALLOWED:
                used.add((f.name, name))
            else:
                problems.append(f'{f.name}:{line}: script uses the app internal `{name}` directly; '
                                f'use a KSMTest operation or KSMTest.app.{name}')
    for key, reason in ALLOWED.items():
        if key not in used:
            problems.append(f'ALLOWED entry {key} is no longer needed ({reason}); remove it')
    if problems:
        print('\n'.join(problems[:40]))
        if len(problems) > 40:
            print(f'... and {len(problems) - 40} more')
        print(f'FAIL  {len(problems)} direct use(s) of app internals in test scripts')
        sys.exit(1)
    print(f'ok  no test script reaches an app internal directly ({len(ALLOWED)} allowed)')


if __name__ == '__main__':
    main()
