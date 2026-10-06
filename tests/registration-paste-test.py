"""Paste from Excel reads spreadsheet rows whatever their line ends (F18).

Excel (and most spreadsheets) copy rows with CR LF line ends; the paste split them on LF only, so
the last column of each row kept a CR: a row ending in its division went into a new division
"Women’s Open⏎" (counted in an extra division, missing from the real one), and a trailing
"Checked In" stayed "Checked In⏎" (shown as Registered).

Offline, Registration -> Individual Players, a clipboard paste (the paste event a Ctrl+V fires) of
rows with CR LF, lone CR and LF line ends, the division or the status as the last column, and
cells with spaces around them: every player is in the real division (no new division, in state
or in the division selects), each "Checked In" is Checked (the chip says
"● Checked In"), the cells hold no CR and no surrounding spaces, and the rows' order is kept.
No page error or unexpected dialog may occur.
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
ROWS = (f'Eve\tKauai\t{WOMEN}\r\n'
        f'Fay\tLanai\t{WOMEN}\t3\tChecked In\r\n'
        f'Gus\tOahu\t{WOMEN}\t\tChecked In\r'
        f' Hal \t Maui \t {WOMEN} \t 4 \t Checked In \n'
        f'Ida\tHilo\t{WOMEN}\t\tNoShow\r\n')


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
        assert WOMEN in divisions, divisions
        page.evaluate(PASTE_JS, ROWS)
        page.wait_for_timeout(100)

        state = app.payload()['state']
        assert state['divisions'] == divisions, f'the paste added a division (F18): {[d for d in state["divisions"] if d not in divisions]!r}'
        got = [(c['name'], c['dojo'], c['division'], c['seed'], c['status']) for c in state['competitors']]
        assert got == [('Eve', 'Kauai', WOMEN, '', 'Registered'), ('Fay', 'Lanai', WOMEN, '3', 'Checked'),
                       ('Gus', 'Oahu', WOMEN, '', 'Checked'), ('Hal', 'Maui', WOMEN, '4', 'Checked'),
                       ('Ida', 'Hilo', WOMEN, '', 'NoShow')], f'pasted rows read wrongly (F18): {got!r}'
        options = page.locator(sel('reg-division')).first.locator('option').all_inner_texts()
        assert len(options) == len(divisions) and len(set(options)) == len(options), f'the division select has an extra division: {options!r}'
        assert [page.locator(sel('reg-division')).nth(i).input_value() for i in range(5)] == [WOMEN] * 5
        assert page.locator(sel('reg-status')).all_inner_texts() == ['○ Registered', '● Checked In', '● Checked In', '● Checked In', '● No Show']
        assert not problems, problems
        browser.close()
    print('PASS registration paste: CR LF / CR / LF rows, trailing division and "Checked In", trimmed cells (F18)')


if __name__ == '__main__':
    main()
