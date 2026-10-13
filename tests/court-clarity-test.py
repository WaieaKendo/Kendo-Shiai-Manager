"""Court screen clarity (#38): the rule is shown before Next Match.

Offline: a single elimination of 4 (winner required) and a round robin of 3 (hikiwake allowed),
both on Court A. On the court screen:
  * a tied winner-required bout (a semifinal) shows "Encho — winner needed" and Next Match is
    disabled; a point clears the label and enables Next Match, which then advances;
  * a tied round robin bout keeps Next Match enabled, reading "Next Match (Hikiwake)";
    a point turns the text back to "Next Match".
"""
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel
from ksm_browser import launch_chromium

PEOPLE = [{'name': n, 'dojo': d, 'seed': '', 'status': 'Checked'}
          for n, d in (('Aki', 'Aiea'), ('Bo', 'Hilo'), ('Cy', 'Kona'), ('Di', 'Hilo'))]


def main():
    problems = []
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        app = KsmApp.local(page, 'Court', problems=problems)
        app.answers['Create Staff password'] = ''
        app.configure([
            {'name': 'Elim', 'format': 'Single Elimination', 'court': 'A', 'entrants': PEOPLE},
            {'name': 'Pool', 'format': 'Round Robin', 'court': 'A', 'entrants': PEOPLE[:3]},
        ])
        next_btn = page.locator(f'#score {sel("next-match")}')
        next_text = lambda: next_btn.inner_text().replace('»', '').strip()
        note = page.locator(f'#score {sel("court-encho-note")}')

        app.open_court('A')
        app.switch_division('Elim')
        app.wait_for(lambda: app.current_match() is not None and app.court_screen()['division'] == 'Elim',
                     message='the elimination semifinal on the court')

        # --- winner required, tied: encho label, Next Match disabled -------------------------
        app.wait_for(lambda: note.count() == 1 and next_btn.is_disabled(), message='encho label and disabled Next Match')
        assert note.inner_text().strip() == 'Encho — winner needed', note.inner_text()
        assert next_text() == 'Next Match', next_btn.inner_text()
        app.score_point('W', 'M')
        app.wait_for(lambda: note.count() == 0 and next_btn.is_enabled(), message='a point clears the label and enables Next Match')
        app.score_point('R', 'K')  # tied again at 1-1
        app.wait_for(lambda: note.count() == 1 and next_btn.is_disabled(), message='tied again: label back, Next Match disabled')
        app.undo()
        app.wait_for(lambda: note.count() == 0 and next_btn.is_enabled(), message='Undo of the tying point enables Next Match')
        first = app.current_match()
        app.next_match(settle=True)
        assert (app.current_match()['white'], app.current_match()['red']) != (first['white'], first['red']), 'Next Match did not advance'

        # --- hikiwake allowed, tied: Next Match stays enabled, says so -----------------------
        app.switch_division('Pool')
        app.wait_for(lambda: app.court_screen()['division'] == 'Pool' and app.current_match() is not None, message='the pool bout')
        app.wait_for(lambda: next_text() == 'Next Match (Hikiwake)', message='"(Hikiwake)" on a tied pool bout')
        assert next_btn.is_enabled() and note.count() == 0
        app.score_point('W', 'M')
        app.wait_for(lambda: next_text() == 'Next Match', message='a point turns the text back')
        assert next_btn.is_enabled()

        assert not problems, problems
        browser.close()
    print('PASS court clarity: encho label + disabled Next Match (winner required), "(Hikiwake)" (draw allowed)')


if __name__ == '__main__':
    main()
