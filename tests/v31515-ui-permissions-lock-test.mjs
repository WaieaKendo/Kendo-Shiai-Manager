import fs from 'node:fs';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../public/service-worker.js',import.meta.url),'utf8');
const checks=[
  ['static undo',html.includes('<span class="action-label">Undo</span>')],
  ['static redo',html.includes('<span class="action-label">Redo</span>')],
  ['no dynamic undo label',!html.includes('`Undo ${undoStack[undoStack.length-1].label}`')],
  ['no dynamic redo label',!html.includes('`Redo ${redoStack[redoStack.length-1].label}`')],
  ['representative permission helper',html.includes('function canModifyRepresentative(m)')],
  ['spectator guard',html.includes("isReadOnlySession())return false")],
  ['assigned court guard',html.includes("matchBelongsToCourt(m,assigned)")],
  ['readonly representative rendering',html.includes('representative-readonly')],
  ['action-layer representative guard',html.includes('!canModifyRepresentative(m)')],
];
const failed=checks.filter(([,ok])=>!ok);
if(failed.length){for(const [name] of failed)console.error('FAIL',name);process.exit(1)}
console.log(`v3.15.15 UI and permissions checks: ${checks.length}/${checks.length}`);
