from pathlib import Path
html=(Path(__file__).parents[1]/'public'/'index.html').read_text()
checks={
 'single column split context':'split-template-context' in html and 'splitTemplateContextHtml' in html,
 'template node queue':'canonicalSingleElimQueue' in html,
 'all nodes instantiated':'templateNode:true' in html and 'nodes.map(node=>({' in html,
 'no dynamic direct creation':"KSM template invariant: missing Match Object" in html and "arr.push({division:div,pool:'Championship'" not in html[html.rfind('function syncIndividualSingleElim'):html.find('function canonicalSingleElimQueue')],
 'readiness gate':'individualMatchReady' in html,
 'court filter after template':'if(nodeCourt!==court)return' in html,
 'one match per node':'elimNodeId:node.id' in html,
 'persistent context':'persistentContextHtml' in html,
 'queue empty on complete':"if(divisionComplete(div)){target.innerHTML='';return;}" in html,
 'court medalist panel':'setCourtCompletePresentation' in html,
 'live medalist panel':'divisionCompletePanelHtml(div)' in html,
}
failed=[k for k,v in checks.items() if not v]
if failed:raise SystemExit('FAIL: '+', '.join(failed))
print(f'PASS: split-court template consolidation {len(checks)}/{len(checks)} assertions')
