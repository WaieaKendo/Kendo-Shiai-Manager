// The court screen header (#score .scoreboard-header): tournament name, court title,
// division select, division title and match line, the same elements, classes, ids and test
// IDs as the legacy markup. The division select stays a real <select> whose change calls the
// legacy selectScorekeeperDivision(), which republishes the header.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { DEFAULT_COURT_LOGO_SRC } from './branding.ts';
import { CONFIGURE_TEXTS, EMPTY_HEADER, RED_SIDE_OPTIONS, courtConfigView, courtHeaderView, type CourtHeaderInput, type RedSide } from './header-model.ts';

export const HEADER_EVENT = 'ksm:court-header';

interface CourtWindow {
  /** The header as the legacy writers last published it. */
  ksmCourtHeaderInput?: CourtHeaderInput;
  selectScorekeeperDivision?: (division: string) => void;
  ksmSetCourtRedSide?: (side: RedSide) => void;
  ksmOpenCourtSetup?: () => void;
}

const courtWindow = (): CourtWindow => window as unknown as CourtWindow;

function subscribe(onChange: () => void): () => void {
  window.addEventListener(HEADER_EVENT, onChange);
  return () => window.removeEventListener(HEADER_EVENT, onChange);
}

const snapshot = (): CourtHeaderInput => courtWindow().ksmCourtHeaderInput ?? EMPTY_HEADER;

/**
 * #38: "Configure court" (staff; hidden from spectators by CSS): a small panel with the court's Red
 * side as Setup words it, Left / Right. Choosing one edits Setup's Red side field for this court
 * (ksmSetCourtRedSide()), which saves and syncs like typing in Setup. Escape or a click outside
 * closes it.
 */
function ConfigureCourt({ input }: { input: CourtHeaderInput }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const { redSide } = courtConfigView(input);
  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent | TouchEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); button.current?.focus(); } };
    document.addEventListener('mousedown', outside);
    document.addEventListener('touchstart', outside);
    document.addEventListener('keydown', key);
    wrap.current?.querySelector<HTMLInputElement>('input:checked')?.focus();
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('touchstart', outside);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <div className="court-config" ref={wrap}>
      <button type="button" className="court-config-btn" aria-haspopup="dialog" aria-expanded={open}
        aria-label={CONFIGURE_TEXTS.button} ref={button} onClick={() => setOpen(o => !o)} data-testid="court-configure">
        <span aria-hidden="true">⚙</span> {CONFIGURE_TEXTS.button}
      </button>
      {open && (
        <div className="court-config-panel" role="dialog" aria-label={CONFIGURE_TEXTS.button} data-testid="court-config-panel">
          <fieldset className="court-config-fieldset">
            <legend>{CONFIGURE_TEXTS.heading}</legend>
            {RED_SIDE_OPTIONS.map(o => (
              <label key={o.value} className="court-config-option">
                <input type="radio" name="courtRedSide" value={o.value} checked={redSide === o.value}
                  onChange={() => courtWindow().ksmSetCourtRedSide?.(o.value)} data-testid={`court-red-side-${o.value}`} />
                <span>{o.label}</span>
              </label>
            ))}
          </fieldset>
          <button type="button" className="court-config-link" onClick={() => { setOpen(false); courtWindow().ksmOpenCourtSetup?.(); }} data-testid="court-config-setup">
            {CONFIGURE_TEXTS.setupLink}
          </button>
        </div>
      )}
    </div>
  );
}

/** logoSrc: the tournament logo (default: the KSM logo, as the legacy markup). */
export function CourtHeader({ logoSrc = DEFAULT_COURT_LOGO_SRC }: { logoSrc?: string }) {
  const input = useSyncExternalStore(subscribe, snapshot, () => EMPTY_HEADER);
  const view = courtHeaderView(input);
  const select = useRef<HTMLSelectElement>(null);
  // The selection as the legacy renderer set it: select.value = current division (nothing
  // selected when it is not an option), else the first option. Every publish re-applies it,
  // like each legacy renderDivisions() did.
  useLayoutEffect(() => {
    const el = select.current;
    if (!el) return;
    if (view.selectValue !== null) el.value = view.selectValue;
    else el.selectedIndex = el.options.length ? 0 : -1;
  }, [input, view.selectValue]);
  return (
    <>
      <div className="scoreboard-tournament">
        <img src={logoSrc} alt="" aria-hidden="true" />
        <div id="scoreTournamentName" data-testid="court-tournament-name">{view.tournamentName}</div>
      </div>
      <div className="scoreboard-heading-center">
        <h1 id="courtTitle" data-testid="court-title">{view.title}</h1>
        <div className="sk-division-row">
          <select id="scoreDiv" className="division-select" ref={select}
            onChange={e => courtWindow().selectScorekeeperDivision?.(e.target.value)} data-testid="court-division-select">
            {view.divisions.map(d => <option key={d}>{d}</option>)}
          </select>
        </div>
        <div className="sk-division-title" id="scoreDivisionTitle" data-testid="court-division-title">{view.divisionTitle}</div>
        <div className="sk-match-line-row">
          <div className="sk-match-line" id="matchMeta" data-testid="court-match-meta">{view.matchLine}</div>
          {view.ruleTag && <span className="court-rule-tag" data-rule={view.ruleTag === 'Winner required' ? 'winner' : 'hikiwake'} data-testid="court-rule-tag">{view.ruleTag}</span>}
        </div>
      </div>
      <div className="scoreboard-heading-spacer" aria-hidden="true"></div>
      <ConfigureCourt input={input} />
    </>
  );
}
