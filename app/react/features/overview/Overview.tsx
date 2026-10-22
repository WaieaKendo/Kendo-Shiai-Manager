// The Overview screen's island: the contents of #director .director-dashboard (the overall card
// and the court cards in #directorCourtGrid), with the same elements, ids, classes and test IDs
// (overview-progress, overview-courts) as the static markup and the legacy renderer
// (renderDirector(), directorMatchRow()) drew, so the Overview CSS and every test apply
// unchanged; tests/golden/overview pins them. renderDirector() (app/js) publishes what to show
// (ksm:overview). The screen has no buttons. No colors or images of its own: the Overview CSS
// and theme tokens; the white/red name columns keep the legacy side classes.
import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import {
  DIVISION_PROGRESS_LABEL, EMPTY_OVERVIEW, NO_MATCH_TEXT, OVERALL_PROGRESS_LABEL, OVERVIEW_KICKER,
  overviewView, type OverviewCourtView, type OverviewInput, type OverviewMatchRowView,
} from './overview-model.ts';

export const OVERVIEW_EVENT = 'ksm:overview';

interface OverviewWindow {
  /** The Overview as renderDirector() last published it. */
  ksmOverviewInput?: OverviewInput;
}

const overviewWindow = (): OverviewWindow => window as unknown as OverviewWindow;

function subscribe(onChange: () => void): () => void {
  window.addEventListener(OVERVIEW_EVENT, onChange);
  return () => window.removeEventListener(OVERVIEW_EVENT, onChange);
}
const snapshot = (): OverviewInput => overviewWindow().ksmOverviewInput ?? EMPTY_OVERVIEW;

/** directorMatchRow(label, m). */
function MatchRow({ row }: { row: OverviewMatchRowView }) {
  return (
    <div className="director-match-row">
      <div className="director-match-label">{row.label}</div>
      {row.match
        ? (
          <div className="director-match-grid">
            <div className="director-player white">{row.match.white}</div>
            <div className="director-vs">vs</div>
            <div className="director-player red">{row.match.red}</div>
          </div>
        )
        : <div className="director-empty">{NO_MATCH_TEXT}</div>}
    </div>
  );
}

/**
 * A court card's progress bar. The legacy template printed the width into the markup
 * (style="width:50%"); React's style prop would write "width: 50%;", so the attribute is set
 * as the template wrote it.
 */
function CourtBar({ style }: { style: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current && ref.current.getAttribute('style') !== style) ref.current.setAttribute('style', style);
  });
  return <div className="director-progress-track"><div ref={ref} className="director-progress-fill"></div></div>;
}

function CourtCard({ court }: { court: OverviewCourtView }) {
  return (
    <section className="director-court-card">
      <div className="director-court-head">
        <h2>{court.title}</h2>
        <div className="director-division">{court.division}</div>
        <div className="director-round">{court.round}</div>
      </div>
      <div className="director-progress-label"><span>{DIVISION_PROGRESS_LABEL}</span><strong>{court.progress}</strong></div>
      {court.barStyle !== null && <CourtBar style={court.barStyle} />}
      <div className="director-remaining">{court.remaining}</div>
      <div className="director-match-list">
        {court.rows.map(row => <MatchRow key={row.label} row={row} />)}
      </div>
    </section>
  );
}

/** The contents of #director .director-dashboard. */
export function Overview() {
  const view = overviewView(useSyncExternalStore(subscribe, snapshot, () => EMPTY_OVERVIEW));
  return (
    <>
      <section className="director-overall-card">
        <div className="director-kicker">{OVERVIEW_KICKER}</div>
        <h1 id="directorTournamentName">{view.tournamentName}</h1>
        <div className="director-progress-label">
          <span>{OVERALL_PROGRESS_LABEL}</span>
          <strong id="directorOverallCount" data-testid="overview-progress">{view.count}</strong>
        </div>
        <div className="director-progress-track">
          {/* renderDirector() set style.width, as React's style prop does. */}
          <div id="directorOverallBar" className="director-progress-fill" style={view.barWidth === null ? undefined : { width: view.barWidth }}></div>
        </div>
        <div id="directorOverallRemaining" className="director-remaining">{view.remaining}</div>
      </section>
      <div id="directorCourtGrid" className="director-court-grid" data-testid="overview-courts">
        {view.courts.map(court => <CourtCard key={court.title} court={court} />)}
      </div>
    </>
  );
}
