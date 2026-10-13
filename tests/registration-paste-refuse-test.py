"""Paste from Excel refuses rows with an unknown division or status (owner decisions 16, 17, #29).

Before: a pasted row with a division that is not offered silently created that division, and a
status other than Checked In / No Show was kept as typed (shown as Registered). Now such rows are
not added, and a notice names each of them and why; the other rows are added as before (an empty
division: the first division; an empty status: Registered; "Checked In", "Checked", "No Show",
"NoShow" and "Registered" are known, in any case). The Paste from Excel button explains the paste
(the columns, the known statuses, what is refused).

Offline, Registration -> Individual Players, a clipboard paste (the paste event a Ctrl+V fires).
"""
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel
from ksm_browser import launch_chromium

WOMEN = 'Women’s Open'
PASTE_JS = """text => {
  const dt = new DataTransfer();
  dt.setData('text/plain', text);
  document.dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true}));
}"""


def main():
    problems = []
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        app = KsmApp.local(page, 'Director', problems=problems)
        app.answers['Create Staff password'] = ''  # offline harness: autosaves stay local
        app.nav('registration')
        app.click('reg-tab-individual')
        divisions = app.payload()['state']['divisions']

        app.expect_dialog('Paste from Excel', accept=True)
        app.click('reg-paste-excel')
        help_text = app.wait_for_dialogs(1)[0]
        for words in ('Name, Dojo, Division, Seed, Status', 'Registered, Checked In or No Show', 'not added'):
            assert words in help_text, f'the button does not explain {words!r}: {help_text}'

        app.expect_dialog('Not added', accept=True)
        page.evaluate(PASTE_JS, f'Ann\tAiea\t{WOMEN}\t1\tChecked In\n'
                                f'Bo\tMaui\n'
                                f'Cy\tHilo\tPasted Division\t\tNoShow\n'
                                f'Dee\tKona\t{WOMEN}\t2\tLate\n'
                                f'Eve\tKauai\t{WOMEN}\t\tno show\n')
        notice = app.wait_for_dialogs(2)[1]
        assert 'Cy' in notice and 'Pasted Division' in notice, notice
        assert 'Dee' in notice and 'Late' in notice, notice
        assert 'Ann' not in notice and 'Eve' not in notice, notice
        state = app.payload()['state']
        assert state['divisions'] == divisions, f'a pasted unknown division was created: {state["divisions"]}'
        got = [(c['name'], c['division'], c['status']) for c in state['competitors']]
        assert got == [('Ann', WOMEN, 'Checked'), ('Bo', divisions[0], 'Registered'), ('Eve', WOMEN, 'NoShow')], got
        assert page.locator(sel('reg-row')).count() == 3
        assert not problems, problems
        browser.close()
    print('PASS Paste from Excel refuses unknown divisions and statuses with a notice naming the rows; the button explains the paste')


if __name__ == '__main__':
    main()
