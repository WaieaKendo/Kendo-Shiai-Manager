// ---------- KSM v3.9.1 Pool Context layout ----------


// ---------- KSM v3.9.1 Unified score-slot renderer ----------
function alignedPointSlots(points,side){
  const values=[...(points||[])].slice(0,2);
  while(values.length<2)values.push('');

  return values.map(value=>{
    const hasValue=!!value;
    const sideClass=hasValue && side==='R' ? 'red' : '';
    return `<div class="match-point ${sideClass} ${hasValue?'':'empty'}">${hasValue?esc(value):'·'}</div>`;
  }).join('');
}


// ---------- KSM v3.9.1 All pool results in Court Context ----------



// ---------- KSM v3.9.1 Dynamic active pool card ----------





