from pathlib import Path
from ksm_source import app_source, court_react_source
html=app_source()
react=court_react_source()
# M.8 step 5: the legacy court renderer is gone. The court screen is React: app/js/35-react-court.js
# makes the decisions and publishes them, app/react/court/ renders them (court_react_source());
# tests/golden/court/*.json pin the result. The court checks below point at that code.
# Node/Match Object construction lives in app/engine/single-elim.ts since roadmap 2.5.
engine=(Path(__file__).resolve().parent.parent/'app/engine/single-elim.ts').read_text()
# M.13: Live Scores is React. app/js/36-react-live-scores.js publishes the complete division's
# placements, app/react/live-scores/LiveScores.tsx draws them with the court's panel.
live_react=(Path(__file__).resolve().parent.parent/'app/react/live-scores/LiveScores.tsx').read_text()
checks={
 'single column split context':'split-template-context' in html and "return {kind:'split-single-elim',cards:" in html and 'single-elim-context-grid split-template-context' in react,
 'template node queue':"const nodes=state.singleElimNodes?.[div]||[],arr=enforceUniqueIndividualMatches(div),out=ksmQueueGroups();" in html,
 'all nodes instantiated':'KSMEngine.buildIndividualSingleElimMatches' in html and 'templateNode: true' in engine and 'nodes.map((node): SingleElimMatch<C> => ({' in engine,
 'no dynamic direct creation':"KSM template invariant: missing Match Object" in html and "arr.push({division:div,pool:'Championship'" not in html[html.rfind('function syncIndividualSingleElim'):html.find('function contextDivisionForCourt')],
 'readiness gate':'individualMatchReady' in html,
 'court filter after template':'if(nodeCourt!==court)return' in html,
 'one match per node':'elimNodeId: node.id' in engine,
 'persistent context':'const div=contextDivisionForCourt();' in html and 'if((state.pools?.[div]||[]).length)return ksmPoolContext(div,null);' in html,
 'queue empty on complete':"if(divisionComplete(div))return {kind:'empty'};" in html,
 'court medalist panel':'setCourtCompletePresentation' in html,
 # F16: the placements are a court card's (kind 'complete') and fill the screen once neither court plays.
 'live medalist panel':"kind:'complete',division:ksmText(div),complete:ksmDivisionCompleteInput(div,true)" in html and "ksmPublishLiveScores({kind:'complete',complete:finished.complete});" in html and "<div className=\"audience-hero\"><DivisionCompletePanel view={view.complete} /></div>" in live_react and "<div className=\"audience-hero\"><DivisionCompletePanel view={body.complete} /></div>" in live_react,
}
failed=[k for k,v in checks.items() if not v]
if failed:raise SystemExit('FAIL: '+', '.join(failed))
print(f'PASS: split-court template consolidation {len(checks)}/{len(checks)} assertions')
