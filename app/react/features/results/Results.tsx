// The Results screen's islands: the contents of #resultsBody (result cards, Special Awards
// editor), the tournament name in the hero (#resultsTournamentName) and the bracket modal's
// title and body (#resultsBracketTitle, #resultsBracketBody), with the same elements, classes
// and test IDs as the legacy Results renderer drew (tests/golden/results pins them), so the
// Results CSS and every test apply unchanged. renderResultsDashboard() and openResultsBracket()
// (app/js) publish what to show (ksm:results, ksm:results-bracket); the modal's visibility, its
// Escape key and close button stay legacy markup and code.
//
// Every button and input calls the same legacy code as the legacy inline handlers
// (openResultsBracket(), addResultAward(), removeResultAward(), and an award field's change:
// ksmSetResultAward()). The awards inputs are uncontrolled, as the legacy markup's were: typing
// changes nothing until the input's change event (leaving it, Enter), which writes state.awards.
// When Results is drawn again an input shows state.awards like a freshly drawn legacy input,
// except the one being typed in, which keeps its focus and text.
// No colors or images of its own: the Results CSS and theme tokens; the brackets are the court
// screen's components.
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { Bracket } from '../../shared/ui/CourtContext.tsx';
import {
  EMPTY_RESULTS, EMPTY_RESULTS_BRACKET, NO_AWARDS_TEXT, NO_DIVISIONS_TEXT,
  resultsBracketView, resultsView, tournamentNameText,
  type AwardInput, type ResultCardView, type ResultDetailView, type ResultsBracketInput, type ResultsInput,
} from './results-model.ts';

export const RESULTS_EVENT = 'ksm:results';
export const RESULTS_BRACKET_EVENT = 'ksm:results-bracket';

type AwardField = keyof AwardInput;

interface ResultsWindow {
  /** The Results screen as renderResultsDashboard() last published it. */
  ksmResultsInput?: ResultsInput;
  /** The bracket modal as openResultsBracket() last published it. */
  ksmResultsBracketInput?: ResultsBracketInput;
  openResultsBracket?: (division: string) => void;
  addResultAward?: () => void;
  removeResultAward?: (index: number) => void;
  ksmSetResultAward?: (index: number, field: AwardField, value: string) => void;
}

const resultsWindow = (): ResultsWindow => window as unknown as ResultsWindow;

const subscribeTo = (event: string) => (onChange: () => void): (() => void) => {
  window.addEventListener(event, onChange);
  return () => window.removeEventListener(event, onChange);
};
const subscribeResults = subscribeTo(RESULTS_EVENT);
const subscribeBracket = subscribeTo(RESULTS_BRACKET_EVENT);
const resultsSnapshot = (): ResultsInput => resultsWindow().ksmResultsInput ?? EMPTY_RESULTS;
const bracketSnapshot = (): ResultsBracketInput => resultsWindow().ksmResultsBracketInput ?? EMPTY_RESULTS_BRACKET;

const useResults = () => useSyncExternalStore(subscribeResults, resultsSnapshot, () => EMPTY_RESULTS);
const useResultsBracket = () => useSyncExternalStore(subscribeBracket, bracketSnapshot, () => EMPTY_RESULTS_BRACKET);

/** resultCardHtml(div). */
function ResultCard({ card }: { card: ResultCardView }) {
  const open = () => resultsWindow().openResultsBracket?.(card.division);
  const title = <h2 className="result-card-title" data-testid="result-card-title">{card.name || card.division}</h2>;
  if (card.kind === 'progress') {
    return (
      <article className={card.placeholder ? 'result-progress-card result-placeholder-card' : 'result-progress-card'} data-testid="result-card">
        {title}
        <div className="result-progress-message">{card.message}</div>
        {card.button !== null && <div className="result-card-footer"><button className="view-bracket-link" onClick={open}>{card.button}</button></div>}
      </article>
    );
  }
  return (
    <article className="result-award-card" data-testid="result-card">
      {title}
      <div className="result-card-rule"></div>
      <div className="placement-list">
        {card.rows.map((row, i) => (
          <div key={i} className={row.className} data-testid="placement-row">
            <div className={row.ribbonClass}></div>
            <div className="placement-label" data-testid="placement-place">{row.place}</div>
            <div className="placement-name" data-testid="placement-name">{row.name}</div>
          </div>
        ))}
      </div>
      <div className="result-card-footer">
        <button className="view-bracket-link" onClick={open}>{card.button}</button>
      </div>
    </article>
  );
}

/**
 * One award field. Uncontrolled like the legacy input: its change event (not React's per
 * keystroke onChange) calls the legacy handler. Drawn again, it shows the published value
 * (as the legacy markup, redrawn, did), unless it has the focus: then the text being typed stays.
 */
function AwardField({ index, field, label, value }: { index: number; field: AwardField; label: string; value: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const at = useRef(index);
  at.current = index;
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && el !== document.activeElement && el.value !== value) el.value = value;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const change = () => resultsWindow().ksmSetResultAward?.(at.current, field, el.value);
    el.addEventListener('change', change);
    return () => el.removeEventListener('change', change);
  }, [field]);
  return <input ref={ref} aria-label={label} defaultValue={value} />;
}

/** Owner decision 8 (#29): a spectator's special awards, read-only (award, recipient, dojo). */
function AwardsList({ awards }: { awards: AwardInput[] }) {
  return (
    <section className="results-awards-card">
      <h2 className="results-awards-title">Special Awards</h2>
      <div className="awards-editor awards-readonly">
        {awards.length
          ? awards.map((a, i) => (
            <div key={i} className="award-view-row" data-testid="award-row">
              <b>{a.award}</b>{a.name && <span>{a.name}</span>}{a.dojo && <span className="small">{a.dojo}</span>}
            </div>
          ))
          : <div className="results-empty">{NO_AWARDS_TEXT}</div>}
      </div>
    </section>
  );
}

/** awardsEditorHtml(). */
function AwardsEditor({ awards }: { awards: AwardInput[] }) {
  return (
    <section className="results-awards-card">
      <h2 className="results-awards-title">Special Awards</h2>
      <div className="awards-editor">
        {awards.length
          ? awards.map((a, i) => (
            <div key={i} className="award-edit-row">
              <AwardField index={i} field="award" label="Award name" value={a.award} />
              <AwardField index={i} field="name" label="Recipient name" value={a.name} />
              <AwardField index={i} field="dojo" label="Dojo" value={a.dojo} />
              <button className="award-remove" onClick={() => resultsWindow().removeResultAward?.(i)} aria-label="Remove award">×</button>
            </div>
          ))
          : <div className="results-empty">{NO_AWARDS_TEXT}</div>}
      </div>
      <div className="award-add-row">
        <button className="primary" onClick={() => resultsWindow().addResultAward?.()}>+ Add Award</button>
      </div>
    </section>
  );
}

/** The contents of #resultsBody: renderResultsDashboard()'s cards, then the awards editor. */
export function ResultsBody() {
  const view = resultsView(useResults());
  if (view.kind === 'empty') return null;
  return (
    <>
      {view.sections.map(section => (
        <SectionFragment key={section.heading} heading={section.heading} cards={section.cards} />
      ))}
      {view.noDivisions && <div className="results-empty">{NO_DIVISIONS_TEXT}</div>}
      {view.readOnly ? <AwardsList awards={view.awards} /> : <AwardsEditor awards={view.awards} />}
    </>
  );
}

function SectionFragment({ heading, cards }: { heading: string; cards: ResultCardView[] }) {
  return (
    <>
      <div className="results-section-heading">{heading}</div>
      <div className="results-card-grid">{cards.map((card, i) => <ResultCard key={i} card={card} />)}</div>
    </>
  );
}

/** #resultsTournamentName (the hero's kicker). */
export function ResultsTournamentName() {
  return <>{tournamentNameText(useResults())}</>;
}

/** completedResultDetailHtml(div). */
function ResultDetail({ detail }: { detail: ResultDetailView }) {
  if (detail.kind === 'bracket') return <Bracket bracket={detail.bracket} />;
  return (
    <div className="context-split">
      <div className="context-box">
        <h2>Pool Results</h2>
        {detail.pools.map((pool, i) => (
          <div key={i} className="bracket-card">
            <div className="bracket-round">{pool.title}</div>
            {pool.standings.map((row, j) => (
              <div key={j} className="stand-row">
                <span>{row.rank}</span>
                <div><b>{row.name}</b><div className="small">{row.dojo}</div></div>
                <b>{row.wins}{row.tiebreak ? '*' : ''}</b><b>{row.pts}{row.tiebreak ? '*' : ''}</b>
              </div>
            ))}
            {pool.tiebreakNote && <div className="small pool-tiebreak-note" data-testid="results-pool-tiebreak-note">{pool.tiebreakNote}</div>}
          </div>
        ))}
      </div>
      <div className="context-box"><h2>Championship Bracket</h2><Bracket bracket={detail.bracket} /></div>
    </div>
  );
}

/** #resultsBracketTitle: the division of the last opened bracket. */
export function ResultsBracketTitle() {
  return <>{resultsBracketView(useResultsBracket()).title}</>;
}

/** #resultsBracketBody: the last opened division's pools and bracket, or team results. */
export function ResultsBracketBody() {
  const view = resultsBracketView(useResultsBracket());
  return view.kind === 'empty' ? null : <ResultDetail detail={view.detail} />;
}
