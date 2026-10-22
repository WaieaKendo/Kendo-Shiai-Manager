// The Results screen (#results, nav "Results"): four React islands in the legacy page
// (index.html, loaded with the court screen, Live Scores and the TV by app/react/main.tsx; the
// build lists its files in the service worker's APP_SHELL, so an offline device has them): the
// result cards and awards editor (#resultsBody), the hero's tournament name
// (#resultsTournamentName) and the bracket modal's title and body (#resultsBracketTitle,
// #resultsBracketBody). The legacy code computes what is shown; renderResultsDashboard() and
// openResultsBracket() publish it (app/js/38-react-results.js) and never write these elements
// (M.13). If this module does not load, the legacy code shows a "Results could not load" notice
// instead (38-react-results.js, on DOMContentLoaded).
import { mountIsland } from '../island.tsx';
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

// renderResultsDashboard() has published since app.js started; the islands start from the last
// publish (the modal from the last opened bracket, if any).
mountIsland(body, <ResultsBody />);
mountIsland(name, <ResultsTournamentName />);
mountIsland(title, <ResultsBracketTitle />);
mountIsland(bracket, <ResultsBracketBody />);
(window as unknown as LegacyWindow).ksmResultsMounted = true;
