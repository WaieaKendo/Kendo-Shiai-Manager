import { html as appSource, readRepoFile } from './lib/ksm-source.mjs';
import fs from 'node:fs';
const html = appSource;
// M.13: Live Scores is React. app/react/features/live-scores/publish.ts decides both courts (#136; app/js/36-react-live-scores.js
// only signals), app/react/features/live-scores/LiveScores.tsx draws them (tests/golden/live-scores pins the result).
const liveReact = readRepoFile('app/react/features/live-scores/LiveScores.tsx');
const livePublish = readRepoFile('app/react/features/live-scores/publish.ts');
const tvPublish = readRepoFile('app/react/features/tv/publish.ts');
// M.13: the shell (navigation, header, dialogs) is React: app/react/features/shell/ draws it, app/js/44-react-shell.js
// publishes what the legacy code decided (tests/golden/shell pins the result).
const shellReact = ['nav-model.ts', 'dialogs-model.ts', 'Dialogs.tsx', 'Shell.tsx'].map(f => readRepoFile(`app/react/features/shell/${f}`)).join('\n');
// M.13: the TV display is React too: renderTvDisplay() signals and app/react/features/tv/publish.ts computes the assigned
// court's view, chosen by buildTV3ViewModel() (26-) with courtCurrentMatch(court).
const checks = [
  ['overview navigation renamed', html.includes('<span>Overview</span>') && html.includes('title="Tournament Overview"')],
  ['spectator courts allowed', html.includes("!['score','public','results','director'].includes(id)")],
  ['shared spectator court presentation', html.includes('body.ksm-spectator #score .score-controls-grid') && html.includes('body.ksm-spectator #score .sk-action-row')],
  ['spectator court context visible', !html.includes('body.ksm-spectator #score{display:none')],
  ['dual court live scores', livePublish.includes("const courts = [ksmLiveScoresCourt('A'), ksmLiveScoresCourt('B')];") && livePublish.includes("liveScoresWindow().ksmLiveScoresInput = { kind: 'courts', courts };") && liveReact.includes('<div className="live-courts-grid">{view.courts.map(c => <CourtCard key={c.testId} card={c} />)}</div>')],
  ['portrait vertical live scores', html.includes('@media(max-width:560px) and (orientation:portrait)') && html.includes('.live-courts-grid{grid-template-columns:1fr')],
  ['wide two column live scores', html.includes('.live-courts-grid{display:grid;grid-template-columns:repeat(2')],
  ['single court TV view', html.includes('function renderTvDisplay()') && tvPublish.includes("tvWindow().ksmTvInput = ksmTvDisplayInput(legacy('tvAssignedCourt')());") && html.includes('function buildTV3ViewModel(court){\n  const data=courtCurrentMatch(court);')],
  // The court TV links: the TV menu's Court A TV / Court B TV (React, nav-model.ts) open tvLink(court).
  // (This checked the rows of the first openTournamentAccess() in 21-, which never ran and was
  // removed with the legacy shell in M.13.)
  ['court specific TV links', html.includes("window.open(tvLink(court),'_blank','noopener')") && html.includes('court:normalizeCourt(court)')
    && shellReact.includes("label: 'Court A TV', testId: 'nav-tv-a', action: call('launchTvDisplay', 'A')") && shellReact.includes("label: 'Court B TV', testId: 'nav-tv-b', action: call('launchTvDisplay', 'B')")],
  ['TV has no normal navigation', html.includes('body.ksm-tv .ksm-topbar') && html.includes("requestedView==='tv'")],
  ['TV remains spectator read only', html.includes("ksmLinkUrl({screen:'tv'") && html.includes('[[\'key\',cloudSession.credentials?.spectator]]')]
];
let pass = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (ok) pass++;
}
console.log(`Shared views and TV display: ${pass}/${checks.length} passed`);
if (pass !== checks.length) process.exit(1);
