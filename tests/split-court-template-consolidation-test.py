from pathlib import Path

html = (Path(__file__).parents[1] / "public" / "index.html").read_text()
checks = {
    "version": "v3.12.2" in html,
    "single column split context": "split-template-context" in html and "splitTemplateContextHtml" in html,
    "template node queue": "canonicalSingleElimQueue" in html,
    "canonical node iteration": "nodes.forEach(node=>" in html,
    "court filter after template": "if(nodeCourt!==court)return" in html,
    "terminal final guard": "if(finalMatch?.done)" in html,
    "one match per node": "canonicalSingleElimMatch" in html,
    "persistent context": "persistentContextHtml" in html,
    "queue empty on complete": "if(divisionComplete(div)){target.innerHTML='';return;}" in html,
    "court medalist panel": "setCourtCompletePresentation" in html,
    "live medalist panel": "divisionCompletePanelHtml(div)" in html and "renderPublic_v3121" in html,
    "dynamic standard structure prohibited": "Split-Court Template Consolidation" in html,
}
failed=[name for name,ok in checks.items() if not ok]
if failed:
    raise SystemExit("FAIL: "+", ".join(failed))
print(f"PASS: split-court template consolidation {len(checks)}/{len(checks)} assertions")
