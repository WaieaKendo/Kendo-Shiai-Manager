// The court screen's match display (#score .scoreboard-match): names, dojos, points and
// hansoku, the same elements, classes, ids and test IDs as the legacy markup, so the court
// CSS (including the Red/White side setting) and the tests apply unchanged.
import { useSyncExternalStore } from 'react';
import {
  EMPTY_SCOREBOARD, scoreboardView,
  type ScoreboardInput, type Side, type SideView,
} from './scoreboard-model.ts';

export const SCOREBOARD_EVENT = 'ksm:court-scoreboard';

interface CourtWindow {
  /** The last ScoreboardInput the legacy renderScore() published. */
  ksmCourtScoreboardInput?: ScoreboardInput;
  setRepresentative?: (side: Side, value: string) => void;
}

const courtWindow = (): CourtWindow => window as unknown as CourtWindow;

function subscribe(onChange: () => void): () => void {
  window.addEventListener(SCOREBOARD_EVENT, onChange);
  return () => window.removeEventListener(SCOREBOARD_EVENT, onChange);
}

const snapshot = (): ScoreboardInput => courtWindow().ksmCourtScoreboardInput ?? EMPTY_SCOREBOARD;

function Name({ side, view }: { side: Side; view: SideView }) {
  const rep = view.representative;
  if (!rep) return <>{view.name}</>;
  if (!rep.editable) return <span className="representative-readonly" data-testid="representative-readonly">{rep.text}</span>;
  return (
    <select value={rep.value} onChange={e => courtWindow().setRepresentative?.(side, e.target.value)} data-testid="representative-select">
      <option value="">{rep.placeholder}</option>
      {rep.options.map(n => <option key={n} value={n}>{n}</option>)}
    </select>
  );
}

function Points({ letters, side }: { letters: string[]; side: Side }) {
  const cls = `score-letter ${side === 'R' ? 'score-letter-red' : 'score-letter-white'}`;
  return <>{letters.map((letter, i) => <span key={i} className={cls}>{letter}</span>)}</>;
}

export function CourtScoreboard() {
  const view = scoreboardView(useSyncExternalStore(subscribe, snapshot, () => EMPTY_SCOREBOARD));
  return (
    <>
      <div className="scoreboard-side scoreboard-white">
        <div className="competitor-head">
          <span className="side-dot white-dot" aria-hidden="true"></span>
          <div>
            <h2 id="whiteName" data-testid="court-white-name"><Name side="W" view={view.white} /></h2>
            <div className="sk-dojo" id="whiteDojo">{view.white.dojo}</div>
          </div>
        </div>
      </div>

      <div className="scoreboard-score-row">
        <div className="score-stack white-score-stack">
          <div className="points white-score" id="whitePts" data-testid="court-white-points"><Points letters={view.white.points} side="W" /></div>
          <div className="tri" id="whiteTri" data-testid="court-white-hansoku">{view.white.hansoku}</div>
        </div>
        <div className="score-vs">vs</div>
        <div className="score-stack red-score-stack">
          <div className="points red-score" id="redPts" data-testid="court-red-points"><Points letters={view.red.points} side="R" /></div>
          <div className="tri" id="redTri" data-testid="court-red-hansoku">{view.red.hansoku}</div>
        </div>
        {view.rule && <div className="court-bout-rule" role="note" data-testid="court-bout-rule">{view.rule}</div>}
        {view.encho && <div className="court-encho-note" role="status" data-testid="court-encho-note">{view.encho}</div>}
      </div>

      <div className="scoreboard-side scoreboard-red">
        <div className="competitor-head red-head">
          <div className="red-identity">
            <h2 id="redName" data-testid="court-red-name"><Name side="R" view={view.red} /></h2>
            <div className="sk-dojo" id="redDojo">{view.red.dojo}</div>
          </div>
          <span className="side-dot red-dot" aria-hidden="true"></span>
        </div>
      </div>
    </>
  );
}
