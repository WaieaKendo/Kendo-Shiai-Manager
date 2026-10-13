// The court screen's context panel (the contents of #courtContext), the same elements, classes
// and test IDs as the legacy renderContext() and its HTML helpers drew (removed in M.8 step 5;
// tests/golden/court pins them), so the court CSS and the tests apply unchanged. renderContext()
// (app/js/32-) publishes what to show (ksm:court-context); setCourtSupportMode() stays legacy
// (classes outside the island).
import { useSyncExternalStore } from 'react';
import { DEFAULT_COURT_PANEL_ICONS, type CourtPanelIcons } from './branding.ts';
import { AlignedRow, BracketCard } from './MatchRows.tsx';
import {
  EMPTY_CONTEXT, courtContextView,
  type BracketCardView, type BracketView, type CourtContextInput, type CourtContextView, type KachinukiLineView, type PoolCardView, type TeamStandingsView,
} from './context-model.ts';

export const CONTEXT_EVENT = 'ksm:court-context';

interface CourtWindow {
  /** The context as renderContext() last published it. */
  ksmCourtContextInput?: CourtContextInput;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CONTEXT_EVENT, onChange);
  return () => window.removeEventListener(CONTEXT_EVENT, onChange);
}

const snapshot = (): CourtContextInput => (window as unknown as CourtWindow).ksmCourtContextInput ?? EMPTY_CONTEXT;

const Cards = ({ cards }: { cards: BracketCardView[] }) => <>{cards.map((c, i) => <BracketCard key={i} card={c} />)}</>;

function TeamStandings({ s }: { s: TeamStandingsView }) {
  return (
    <>
      <div className="small team-standings-status">{s.status}</div>
      <div className={s.tableClass}>
        <div className="team-standings-row header"><span>Rank</span><span>Team</span><span>Team W-L</span><span>Bout W</span><span>Pts</span></div>
        {s.rows.map((r, i) => (
          <div key={i} className="team-standings-row">
            <b>{r.rank}</b><span><b>{r.name}</b>{r.nameFallback && <small>Name fallback</small>}</span><b>{r.record}</b><b>{r.matchWins}</b><b>{r.pts}</b>
          </div>
        ))}
      </div>
      {s.nameFallbackNote && <div className="small team-standings-note">Teams level on team wins, bout wins and points share a place and are listed by name; a daihyosen decides 1st–3rd.</div>}
      {s.pairs && (
        <div className="results-team-bracket team-round-robin-pairs">
          <h2>Team Pair Results</h2>
          {s.pairs.map((p, i) => <section key={i} className="results-team-round"><h3>{p.title}</h3><AlignedRow row={p.row} /></section>)}
        </div>
      )}
    </>
  );
}

/** bracketHtml() / teamResultsBracketHtml() (28-aligned-results-and-brackets.js, removed in
 * M.13); also the Results screen's bracket modal (app/react/results/) and the Pools view's
 * preview (app/react/pools/). */
export function Bracket({ bracket }: { bracket: BracketView }) {
  switch (bracket.kind) {
    case 'cards': return <Cards cards={bracket.cards} />;
    case 'message': return <div className="muted-card">{bracket.text}</div>;
    case 'results-empty': return <div className="results-empty">{bracket.text}</div>;
    case 'team-standings': return <TeamStandings s={bracket.standings} />;
    case 'team-bracket':
      return (
        <div className="results-team-bracket">
          {bracket.rounds.map((r, i) => (
            <section key={i} className="results-team-round">
              <div className="team-round-metric-head" data-testid="team-round-head">
                <h3>{r.round}</h3>
                <span className="metric-label white-wins">Wins</span>{' '}
                <span className="metric-label white-points">Points</span>{' '}
                <span className="metric-label red-wins">Wins</span>{' '}
                <span className="metric-label red-points">Points</span>
              </div>
              {r.rows.map((row, j) => <AlignedRow key={j} row={row} />)}
            </section>
          ))}
        </div>
      );
  }
}

/** As the legacy poolResultCardHtml() (31-, removed). */
function PoolCard({ card, icons }: { card: PoolCardView; icons: CourtPanelIcons }) {
  return (
    <section className={card.className} data-testid="context-pool">
      <h3>
        <span data-testid="context-pool-title">{card.title}</span>
        {card.complete && <span className="pool-complete-mark" data-testid="context-pool-complete" aria-label="Complete">{icons.poolComplete}</span>}
      </h3>
      <div className="pool-result-standings">
        <div className="stand-row small"><b>#</b><b>Name</b><b>Wins</b><b>Pts</b></div>
        {card.standings.map((s, i) => (
          <div key={i} className="stand-row"><span>{s.rank}</span><div><b>{s.name}</b><div className="small">{s.dojo}</div></div><b>{s.wins}</b><b>{s.pts}</b></div>
        ))}
      </div>
      <div>{card.matches.length ? card.matches.map((m, i) => <AlignedRow key={i} row={m} />) : <div className="small">No pool matches available.</div>}</div>
    </section>
  );
}

const PoolGrid = ({ cards, icons }: { cards: PoolCardView[]; icons: CourtPanelIcons }) => <div className="all-pools-context-grid">{cards.map((c, i) => <PoolCard key={i} card={c} icons={icons} />)}</div>;

function Lineup({ lines }: { lines: KachinukiLineView[] }) {
  return <div>{lines.map((l, i) => <div key={i} className={l.className}><b>{l.name}</b>{' '}<span className="small">{l.state}</span></div>)}</div>;
}

/** The contents of #courtContext. icons: the tournament's (default: KSM's). */
export function CourtContext({ icons = DEFAULT_COURT_PANEL_ICONS }: { icons?: CourtPanelIcons }) {
  return <ContextPanel view={courtContextView(useSyncExternalStore(subscribe, snapshot, () => EMPTY_CONTEXT))} icons={icons} />;
}

/** What the context panel draws for a view. Live Scores draws a team match's bout sheet and a
 * kachinuki sheet with it (app/react/live-scores/), as the legacy screens shared
 * teamSheetHtml() / kachinukiSheetHtml(). */
export function ContextPanel({ view, icons = DEFAULT_COURT_PANEL_ICONS }: { view: CourtContextView; icons?: CourtPanelIcons }) {
  switch (view.kind) {
    case 'empty': return null;
    case 'message': return <div className="muted-card">{view.text}</div>;
    case 'kachinuki':
      return (
        <div className="team-sheet">
          <div className="team-sheet-head"><div>{view.teamWhite}</div><div className="redHead">{view.teamRed}</div></div>
          <div className="kachinuki-current-result"><AlignedRow row={view.current} /></div>
          <div className="team-sheet-row"><Lineup lines={view.white} /><div></div><Lineup lines={view.red} /></div>
        </div>
      );
    case 'team-sheet':
      return (
        <div className="team-sheet">
          <div className="team-sheet-head"><div>{view.teamWhite}</div><div className="redHead">{view.teamRed}</div></div>
          {view.rows.map((r, i) => <AlignedRow key={i} row={r} />)}
          <div className="team-score-footer">
            <div className="white">{`Wins ${view.totals.wWins}`}<br /><span className="small">{`Points ${view.totals.wPts}`}</span></div>
            <div></div>
            <div className="red">{`Wins ${view.totals.rWins}`}<br /><span className="small">{`Points ${view.totals.rPts}`}</span></div>
          </div>
        </div>
      );
    case 'single-elim':
      return (
        <div className="single-elim-context-grid">
          <div className="single-elim-context-column">
            <h2>Earlier Rounds</h2>
            {view.left.length ? <Cards cards={view.left} /> : <div className="muted-card">No earlier round for this bracket size.</div>}
          </div>
          <div className="single-elim-context-column">
            <h2>Later Rounds</h2>
            {view.right.length ? <Cards cards={view.right} /> : <div className="muted-card">Later rounds will appear here.</div>}
          </div>
        </div>
      );
    case 'split-single-elim':
      return <div className="single-elim-context-grid split-template-context"><div className="single-elim-context-column"><Cards cards={view.cards} /></div></div>;
    case 'pools':
      return (
        <div className="pool-context-stack">
          {view.inProgress.length > 0 && (
            <>
              <div className="context-box"><div className="pool-context-section-label">Pools In Progress</div><PoolGrid cards={view.inProgress} icons={icons} /></div>
              <div className="pool-context-divider" aria-hidden="true"></div>
            </>
          )}
          <div className="context-box pool-context-bracket" data-testid="context-bracket"><h2>Championship Bracket Preview</h2><Bracket bracket={view.bracket} /></div>
          {view.completed.length > 0 && (
            <>
              <div className="pool-context-divider" aria-hidden="true"></div>
              <div className="context-box"><PoolGrid cards={view.completed} icons={icons} /></div>
            </>
          )}
        </div>
      );
    case 'bracket': return <Bracket bracket={view.bracket} />;
  }
}
