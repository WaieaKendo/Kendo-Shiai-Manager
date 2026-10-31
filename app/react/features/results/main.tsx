// The Results screen (#results, nav "Results"): four React islands in the legacy page
// (index.html, loaded with the court screen, Live Scores and the TV by app/react/main.tsx; the
// build lists its files in the service worker's APP_SHELL, so an offline device has them): the
// result cards and awards editor (#resultsBody), the hero's tournament name
// (#resultsTournamentName) and the bracket modal's title and body (#resultsBracketTitle,
// #resultsBracketBody). The legacy code only signals (renderResultsDashboard() and
// openResultsBracket() -> ksm:results / ksm:results-bracket, app/js/38-react-results.js);
// publish.ts computes what is shown and these elements are never written by legacy (M.13). If this module does not load, the legacy code shows a "Results could not load" notice
// instead (38-react-results.js, on DOMContentLoaded).
import { mountIsland } from '../../shared/lib/island.tsx';
import { startResultsInput } from './publish.ts';
import { ResultsBody, ResultsBracketBody, ResultsBracketTitle, ResultsTournamentName } from './Results.tsx';

interface LegacyWindow {
  /** Set here once the islands are mounted; the legacy fallback notice checks it. */
  ksmResultsMounted?: boolean;
}

const find = (selector: string): Element => {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`KSM Results: ${selector} is missing`);
  return el;
};
const body = find('#results #resultsBody');
const name = find('#results #resultsTournamentName');
const title = find('#resultsBracketModal #resultsBracketTitle');
const bracket = find('#resultsBracketModal #resultsBracketBody');

// Pull: the input is computed from the legacy app on every ksm:results / ksm:results-bracket
// signal (and now, for one sent before this module ran); started before mounting so it runs
// ahead of the islands' own listeners. The islands start from the last input (the modal from the
// last opened bracket, if any).
startResultsInput();
mountIsland(body, <ResultsBody />);
mountIsland(name, <ResultsTournamentName />);
mountIsland(title, <ResultsBracketTitle />);
mountIsland(bracket, <ResultsBracketBody />);
(window as unknown as LegacyWindow).ksmResultsMounted = true;
