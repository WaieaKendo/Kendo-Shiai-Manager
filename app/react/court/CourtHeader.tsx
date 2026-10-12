// The court screen header (#score .scoreboard-header): tournament name, court title,
// division select, division title and match line, the same elements, classes, ids and test
// IDs as the legacy markup. The division select stays a real <select> whose change calls the
// legacy selectScorekeeperDivision(), which republishes the header.
import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { DEFAULT_COURT_LOGO_SRC } from './branding.ts';
import { EMPTY_HEADER, courtHeaderView, type CourtHeaderInput } from './header-model.ts';

export const HEADER_EVENT = 'ksm:court-header';

interface CourtWindow {
  /** The header as the legacy writers last published it. */
  ksmCourtHeaderInput?: CourtHeaderInput;
  selectScorekeeperDivision?: (division: string) => void;
}

const courtWindow = (): CourtWindow => window as unknown as CourtWindow;

function subscribe(onChange: () => void): () => void {
  window.addEventListener(HEADER_EVENT, onChange);
  return () => window.removeEventListener(HEADER_EVENT, onChange);
}

const snapshot = (): CourtHeaderInput => courtWindow().ksmCourtHeaderInput ?? EMPTY_HEADER;

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
        <div className="sk-match-line" id="matchMeta" data-testid="court-match-meta">{view.matchLine}</div>
      </div>
      <div className="scoreboard-heading-spacer" aria-hidden="true"></div>
    </>
  );
}
