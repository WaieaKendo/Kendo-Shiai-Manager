"""The Overview's overall progress counts kachinuki bouts the same way in "completed" and in the
total, so the bar never passes 100% (F15).

A kachinuki division has no fixed number of bouts (the next bout is created as the last one
ends). The overall line counted its bouts in "N Completed" but not in the total ("fixed-format
total T"), so with kachinuki the bar's width went past 100% (600% in the recorded tournament; the
track clipped it, so it looked full too early) and with only kachinuki divisions it stayed empty.
Now a kachinuki division adds the bouts known so far (played and created) to the total.

Offline, through the UI: a kachinuki round robin of 3 teams on Court A next to an individual
round robin of 3 on Court B; bouts are played on the court screen and the Overview is opened after
each: "C / T Matches so far" with C = every finished bout, T = the individual round robin's 3
matches + every kachinuki bout created so far, C <= T, the bar at round(C / T * 100)% and never
wider than its track; then a tournament with only the kachinuki division (the bar is not empty
once bouts are played). No page error or unexpected dialog may occur.
"""
import re

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel
from ksm_browser import launch_chromium

KACHINUKI = {'team': True, 'format': 'Kachinuki', 'tournament': 'Round Robin', 'teams': 3, 'court': 'A'}
INDIVIDUAL = {'name': 'Open', 'format': 'Round Robin', 'court': 'B',
              'entrants': [{'name': f'P{i}', 'dojo': f'Dojo {i}', 'seed': '', 'status': 'Checked'} for i in range(1, 4)]}
OVERALL_JS = """() => {
  const count = document.querySelector('[data-testid="overview-progress"]');
  const card = count.closest('section');
  const fill = card.querySelector('.director-progress-fill'), track = fill.parentElement;
  return {text: count.textContent.trim(), style: fill.style.width,
          fill: fill.getBoundingClientRect().width, track: track.getBoundingClientRect().width};
}"""


def overall(app):
    app.nav('overview')
    return app.page.evaluate(OVERALL_JS)


def expected(app):
    matches = [m for ms in app.all_matches().values() for m in ms]
    done = sum(1 for m in matches if m.get('done'))
    kachinuki = sum(1 for m in matches if m.get('type') in ('kachinuki', 'teamPlayoff'))
    fixed = sum(1 for m in matches if m.get('type') == 'individual')
    return done, kachinuki + fixed


def check(app, label):
    o = overall(app)
    done, total = expected(app)
    m = re.fullmatch(r'(\d+) / (\d+) Matches so far', o['text'])
    assert m, f'{label}: the overall line does not count kachinuki in the total (F15): {o}'
    shown_done, shown_total = int(m.group(1)), int(m.group(2))
    assert (shown_done, shown_total) == (done, total), f'{label}: shown {shown_done} / {shown_total}, expected {done} / {total}'
    assert shown_done <= shown_total, f'{label}: more completed than in total (F15): {o}'
    assert o['style'] == f'{round(done / total * 100) if total else 0}%', f'{label}: bar {o["style"]}, expected {done}/{total} (F15)'
    assert o['fill'] <= o['track'] + 0.5, f'{label}: the bar is wider than its track (F15): {o}'
    return o


def play_bouts(app, n):
    app.open_court('A')
    app.switch_division('Team Tournament')
    for _ in range(n):
        app.score_point('W', 'M')
        app.score_point('W', 'K')
        app.next_match()


def main():
    problems = []
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        app = KsmApp.local(page, 'Director', problems=problems)
        app.answers['Create Staff password'] = ''  # offline harness: autosaves stay local
        app.configure([INDIVIDUAL, KACHINUKI])
        check(app, 'generated')
        for i in range(1, 7):
            play_bouts(app, 1)
            check(app, f'after kachinuki bout {i}')
        page.close()

        # Only a kachinuki division: the total is the bouts known so far, not 0.
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        app = KsmApp.local(page, 'Director', problems=problems)
        app.answers['Create Staff password'] = ''
        app.configure([{**INDIVIDUAL, 'entrants': []}, KACHINUKI])
        play_bouts(app, 3)
        o = check(app, 'kachinuki only')
        assert o['fill'] > 0, f'kachinuki only: the bar stays empty (F15): {o}'
        assert not problems, problems
        browser.close()
    print('PASS Overview kachinuki progress: completed and total count the same bouts, the bar stays within 100% (F15)')


if __name__ == '__main__':
    main()
