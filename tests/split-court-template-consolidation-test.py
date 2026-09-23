from pathlib import Path
from ksm_source import app_source
html=app_source()
# Node/Match Object construction lives in app/engine/single-elim.ts since roadmap 2.5.
engine=(Path(__file__).resolve().parent.parent/'app/engine/single-elim.ts').read_text()
checks={
 'single column split context':'split-template-context' in html and 'splitTemplateContextHtml' in html,
 'template node queue':'canonicalSingleElimQueue' in html,
 'all nodes instantiated':'KSMEngine.buildIndividualSingleElimMatches' in html and 'templateNode: true' in engine and 'nodes.map((node): SingleElimMatch<C> => ({' in engine,
 'no dynamic direct creation':"KSM template invariant: missing Match Object" in html and "arr.push({division:div,pool:'Championship'" not in html[html.rfind('function syncIndividualSingleElim'):html.find('function canonicalSingleElimQueue')],
 'readiness gate':'individualMatchReady' in html,
 'court filter after template':'if(nodeCourt!==court)return' in html,
 'one match per node':'elimNodeId: node.id' in engine,
 'persistent context':'persistentContextHtml' in html,
 'queue empty on complete':"if(divisionComplete(div)){target.innerHTML='';return;}" in html,
 'court medalist panel':'setCourtCompletePresentation' in html,
 'live medalist panel':'divisionCompletePanelHtml(div)' in html,
}
failed=[k for k,v in checks.items() if not v]
if failed:raise SystemExit('FAIL: '+', '.join(failed))
print(f'PASS: split-court template consolidation {len(checks)}/{len(checks)} assertions')
