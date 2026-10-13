// The TV display (the contents of #tvLive), the same elements, classes and test IDs (tv-canvas,
// tv-header, tv-court, tv-division, tv-meta, tv-current-match, tv-white-name, tv-white-score,
// tv-upcoming, tv-upcoming-card, ...) as the legacy tv3 renderer drew (tests/golden/tv pins them),
// so the TV CSS (the fixed 1920×1080 canvas and its 210/610/260 px zones, app/styles/13-tv.css)
// and the tests apply unchanged. renderTvDisplay() (app/js) publishes what to show (ksm:tv).
//
// Text the legacy template wrote as one string ("Court A", " 2   " around the summary
// labels) is one text node here too. No colors or images of its own: the TV CSS (theme tokens
// and the fixed red/white side colors); the Final Results are the court screen's
// division-complete panel.
import { useSyncExternalStore } from 'react';
import { DivisionCompletePanel } from '../court/CourtComplete.tsx';
import {
  DIVISION_COMPLETE_TEXT, EMPTY_TV, NO_UPCOMING_TEXT, UPCOMING_TITLE, tvView,
  type TvBodyView, type TvFooterView, type TvInput, type TvKachinukiRowView, type TvPlayerView,
} from './tv-model.ts';
import type { HansokuView } from '../live-scores/live-scores-model.ts';

export const TV_EVENT = 'ksm:tv';

interface TvWindow {
  /** The TV display as renderTvDisplay() last published it. */
  ksmTvInput?: TvInput;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(TV_EVENT, onChange);
  return () => window.removeEventListener(TV_EVENT, onChange);
}

const snapshot = (): TvInput => (window as unknown as TvWindow).ksmTvInput ?? EMPTY_TV;

/** A side's hansoku triangles (owner decision 5), only when it has any. */
function Hansoku({ side, marks, testId = true }: { side: 'white' | 'red'; marks: string; testId?: boolean }) {
  return marks
    ? <span className="tv3-hansoku" data-testid={testId ? `tv-${side}-hansoku` : undefined} aria-label={`${side === 'white' ? 'White' : 'Red'} hansoku`}>{marks}</span>
    : null;
}

/** tv3Player(): the side's colour rule, the name (one span per part) and the dojo; the hansoku. */
function Player({ side, player, hansoku }: { side: 'white' | 'red'; player: TvPlayerView; hansoku?: HansokuView | undefined }) {
  const red = side === 'red' ? ' red' : '';
  return (
    <div className={`tv3-player${red}`}>
      <div className={`tv3-top-rule${red}`}></div>
      <div className="tv3-player-copy">
        <div className="tv3-name" data-testid={`tv-${side}-name`}>{player.nameParts.map((part, i) => <span key={i}>{part}</span>)}</div>
        <div className="tv3-sub">{player.sub}</div>
        {hansoku && <Hansoku side={side} marks={hansoku[side]} />}
      </div>
    </div>
  );
}

function Scores({ white, red }: { white: string; red: string }) {
  return (
    <>
      <div className="tv3-score white" data-testid="tv-white-score">{white}</div>
      <div className="tv3-versus">vs</div>
      <div className="tv3-score red" data-testid="tv-red-score">{red}</div>
    </>
  );
}

function Summary({ side, wins, points }: { side: 'white' | 'red'; wins: string; points: string }) {
  return (
    <div className="tv3-summary" data-testid={`tv-${side}-summary`}>
      <span className="label">Wins</span>{` ${wins}   `}<span className="label">Points</span>{` ${points}`}
    </div>
  );
}

function KachinukiRows({ rows }: { rows: TvKachinukiRowView[] }) {
  return (
    <div className="tv3-k-rows">
      {rows.map((row, i) => (
        <div key={i} className={`tv3-k-row ${row.state}`} data-testid="tv-kachinuki-row">
          <span>{row.name}</span><span className="tv3-k-state">{row.state}</span>
        </div>
      ))}
    </div>
  );
}

function Body({ body }: { body: TvBodyView }) {
  switch (body.kind) {
    case 'idle': return <div className="tv3-body"></div>;
    case 'results':
      return <div className="tv3-body tv3-results-body"><DivisionCompletePanel view={body.complete} /></div>;
    case 'individual':
      return (
        <div className="tv3-body">
          <div className="tv3-individual" data-testid="tv-current-match">
            <Player side="white" player={body.white} hansoku={body.hansoku} />
            <Scores white={body.whitePoints} red={body.redPoints} />
            <Player side="red" player={body.red} hansoku={body.hansoku} />
          </div>
        </div>
      );
    case 'team':
      return (
        <div className="tv3-body">
          <div className="tv3-team-grid" data-testid="tv-current-match">
            <div className="tv3-team-col">
              <div className="tv3-top-rule"></div>
              <div className="tv3-team-name" data-testid="tv-white-team">{body.teamWhite}</div>
              <div className={body.rosterClass}>
                {body.rows.map(row => (
                  <div key={row.pos} className={`tv3-team-row${row.active ? ' active' : ''}`} data-testid={row.active ? 'tv-active-bout' : undefined}>
                    <div className="tv3-person" data-testid={row.active ? 'tv-white-name' : undefined}><span className="tv3-pos">{row.pos}</span>{row.white}</div>
                    <div className="tv3-row-score">{row.hansoku && <Hansoku side="white" marks={row.hansoku.white} testId={row.active} />}{row.whitePoints}</div>
                  </div>
                ))}
              </div>
              <Summary side="white" wins={body.summary.wWins} points={body.summary.wPts} />
            </div>
            <div></div>
            <div className="tv3-team-col red">
              <div className="tv3-top-rule red"></div>
              <div className="tv3-team-name" data-testid="tv-red-team">{body.teamRed}</div>
              <div className={body.rosterClass}>
                {body.rows.map(row => (
                  <div key={row.pos} className={`tv3-team-row${row.active ? ' active' : ''}`}>
                    <div className="tv3-row-score">{row.redPoints}{row.hansoku && <Hansoku side="red" marks={row.hansoku.red} testId={row.active} />}</div>
                    <div className="tv3-person" data-testid={row.active ? 'tv-red-name' : undefined}>{row.red}<span className="tv3-pos">{row.pos}</span></div>
                  </div>
                ))}
              </div>
              <Summary side="red" wins={body.summary.rWins} points={body.summary.rPts} />
            </div>
          </div>
        </div>
      );
    case 'kachinuki':
      return (
        <div className="tv3-body">
          <div className="tv3-k-wrap" data-testid="tv-current-match">
            <div className="tv3-k-current" data-testid="tv-kachinuki-current">
              <Player side="white" player={body.white} hansoku={body.hansoku} />
              <Scores white={body.whitePoints} red={body.redPoints} />
              <Player side="red" player={body.red} hansoku={body.hansoku} />
            </div>
            <div className="tv3-k-lineups">
              <div className="tv3-k-team" data-testid="tv-kachinuki-lineup">
                <div className="tv3-top-rule"></div>
                <div className="tv3-k-title">{body.teamWhite}</div>
                <KachinukiRows rows={body.rowsW} />
              </div>
              <div></div>
              <div className="tv3-k-team red" data-testid="tv-kachinuki-lineup">
                <div className="tv3-top-rule red"></div>
                <div className="tv3-k-title">{body.teamRed}</div>
                <KachinukiRows rows={body.rowsR} />
              </div>
            </div>
          </div>
        </div>
      );
  }
}

function Footer({ footer }: { footer: TvFooterView }) {
  if (footer.kind === 'results') return <div className="tv3-results-footer"><div>{DIVISION_COMPLETE_TEXT}</div></div>;
  return (
    <div className="tv3-upcoming" data-testid="tv-upcoming">
      <div className="tv3-upcoming-title">{UPCOMING_TITLE}</div>
      {footer.cards.map((card, i) => card
        ? (
          <div key={i} className="tv3-up-card" data-testid="tv-upcoming-card">
            <div>
              <div className="tv3-up-name" data-testid="tv-upcoming-white">{card.white}</div>
              {card.whiteSub && <div className="tv3-up-sub">{card.whiteSub}</div>}
            </div>
            <div className="tv3-up-vs">vs</div>
            <div>
              <div className="tv3-up-name" data-testid="tv-upcoming-red">{card.red}</div>
              {card.redSub && <div className="tv3-up-sub">{card.redSub}</div>}
            </div>
          </div>
        )
        : <div key={i} className="tv3-up-card empty" data-testid="tv-upcoming-card"><div className="tv3-up-name">{NO_UPCOMING_TEXT}</div></div>)}
    </div>
  );
}

/** The contents of #tvLive. */
export function Tv() {
  const view = tvView(useSyncExternalStore(subscribe, snapshot, snapshot));
  if (view.kind === 'empty') return null;
  return (
    <div className="tv3-root" data-testid="tv-canvas">
      <div className="tv3-head" data-testid="tv-header">
        <div className="tv3-court" data-testid="tv-court">{view.header.court}</div>
        <div className="tv3-division" data-testid="tv-division">{view.header.division}</div>
        <div className="tv3-meta" data-testid="tv-meta">{view.header.meta}</div>
      </div>
      <Body body={view.body} />
      <Footer footer={view.footer} />
    </div>
  );
}
