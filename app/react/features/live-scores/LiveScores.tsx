// The Live Scores screen (the contents of #publicLive), the same elements, classes and test IDs
// (live-court-A/B, live-meta, live-white-name, live-red-name, division-complete, ...) as the
// legacy renderPublic() / liveScoresCourtCard() drew (tests/golden/live-scores pins them), so
// the Live Scores CSS (desktop two columns, phone portrait/landscape) and the tests apply
// unchanged. renderPublic() (app/js) publishes what to show (ksm:live-scores).
//
// Text that the legacy template wrote as one string ("Court A", "<division> • <line>") is one
// string here too, so the page has the same text nodes. No colors or images of its own: the
// styles are the existing Live Scores CSS (theme tokens), the team sheets and the placements
// are the court screen's components.
import { TieFlashBanner } from '../tie-flash/TieFlash.tsx';
import { useSyncExternalStore } from 'react';
import { DivisionCompletePanel } from '../../shared/ui/CourtComplete.tsx';
import { ContextPanel } from '../../shared/ui/CourtContext.tsx';
import {
  EMPTY_LIVE_SCORES, IDLE_TEXT, WAITING_TEXT, LIVE_SCORES_HEADING, NO_NEXT_TEXT, liveScoresView,
  type HansokuView, type LiveCourtBodyView, type LiveCourtView, type LivePlayerInput, type LiveScoresInput,
} from './live-scores-model.ts';

export const LIVE_SCORES_EVENT = 'ksm:live-scores';

interface LiveScoresWindow {
  /** Live Scores as renderPublic() last published it. */
  ksmLiveScoresInput?: LiveScoresInput;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(LIVE_SCORES_EVENT, onChange);
  return () => window.removeEventListener(LIVE_SCORES_EVENT, onChange);
}

const snapshot = (): LiveScoresInput => (window as unknown as LiveScoresWindow).ksmLiveScoresInput ?? EMPTY_LIVE_SCORES;

/** A side's hansoku triangles (owner decision 5), only when it has any. */
function Hansoku({ side, marks }: { side: 'white' | 'red'; marks: string }) {
  return marks ? <span className="tri live-hansoku" data-testid={`live-${side}-hansoku`} aria-label={`${side === 'white' ? 'White' : 'Red'} hansoku`}>{marks}</span> : null;
}

function Player({ side, player, hansoku }: { side: 'white' | 'red'; player: LivePlayerInput; hansoku?: HansokuView | undefined }) {
  return (
    <div className={`live-player ${side}`}>
      <span className="live-side-label">{side === 'white' ? 'White' : 'Red'}</span>
      <strong data-testid={`live-${side}-name`}>{player.name}</strong>
      <small>{player.dojo}</small>
      {hansoku && <Hansoku side={side} marks={hansoku[side]} />}
    </div>
  );
}

/** A team or kachinuki card's current bout hansoku, under its sheet (owner decision 5). */
function BoutHansoku({ hansoku }: { hansoku?: HansokuView | undefined }) {
  if (!hansoku) return null;
  return (
    <div className="live-bout-hansoku">
      <span>{hansoku.white && <><span className="live-side-label">White</span> <Hansoku side="white" marks={hansoku.white} /></>}</span>
      <span>{hansoku.red && <><span className="live-side-label">Red</span> <Hansoku side="red" marks={hansoku.red} /></>}</span>
    </div>
  );
}

function Body({ body }: { body: LiveCourtBodyView }) {
  switch (body.kind) {
    case 'idle':
      return (
        <>
          <div className="live-empty">
            {body.waiting ? WAITING_TEXT : IDLE_TEXT}
            {body.reason && <div className="small live-waiting-reason" data-testid="live-waiting-reason">{body.reason}</div>}
          </div>
          {body.upNext && (
            // Owner decision 6: the court's next division, marked as upcoming.
            <div className="live-next live-up-next" data-testid="live-up-next">
              <span>{body.upNext.title}</span>
              {body.upNext.matches.map((m, i) => <span key={i} className="live-up-next-match"><b>{m.white}</b><i>vs</i><b>{m.red}</b></span>)}
            </div>
          )}
        </>
      );
    case 'individual':
      return (
        <div className="live-match-row">
          <Player side="white" player={body.white} hansoku={body.hansoku} />
          <div className="live-score-pair"><b>{body.whitePoints}</b><span>vs</span><b>{body.redPoints}</b></div>
          <Player side="red" player={body.red} hansoku={body.hansoku} />
        </div>
      );
    case 'team': return <><ContextPanel view={{ kind: 'team-sheet', ...body.sheet }} /><BoutHansoku hansoku={body.hansoku} /></>;
    case 'kachinuki': return <><ContextPanel view={{ kind: 'kachinuki', ...body.sheet }} /><BoutHansoku hansoku={body.hansoku} /></>;
    // F16: a finished division's placements in its court's card, drawn as the full-screen
    // placements are (the dark audience panel, so the placement colors stay legible).
    case 'complete': return <div className="audience-hero"><DivisionCompletePanel view={body.complete} /></div>;
  }
}

function CourtCard({ card }: { card: LiveCourtView }) {
  return (
    <section className={card.className} data-testid={card.testId}>
      <div className="live-court-head"><h2>{card.title}</h2><span data-testid="live-meta">{card.meta}</span></div>
      <Body body={card.body} />
      <TieFlashBanner court={card.title.replace('Court ', '')} />
      {card.next && (
        <div className="live-next">
          <span>Next</span>
          {card.next.match ? <><b>{card.next.match.white}</b><i>vs</i><b>{card.next.match.red}</b></> : <em>{NO_NEXT_TEXT}</em>}
        </div>
      )}
    </section>
  );
}

/** The contents of #publicLive. */
export function LiveScores() {
  const view = liveScoresView(useSyncExternalStore(subscribe, snapshot, snapshot));
  switch (view.kind) {
    case 'empty': return null;
    case 'complete': return <div className="audience-hero"><DivisionCompletePanel view={view.complete} /></div>;
    case 'courts':
      return (
        <>
          <div className="live-scores-heading"><div className="setup-panel-eyebrow">{LIVE_SCORES_HEADING.eyebrow}</div><h1>{LIVE_SCORES_HEADING.title}</h1></div>
          <div className="live-courts-grid">{view.courts.map(c => <CourtCard key={c.testId} card={c} />)}</div>
        </>
      );
  }
}
