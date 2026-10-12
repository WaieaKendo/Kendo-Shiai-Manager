// ---------- KSM v3.9.1 Grouped court queue ----------
function normalizeQueueGroupLabel(label){
  const raw=String(label||'Upcoming').trim();
  const low=raw.toLowerCase();
  if(low.includes('quarter'))return 'Quarterfinals';
  if(low.includes('semi'))return 'Semifinals';
  if(low==='final'||low.includes('final match'))return 'Final';
  if(low.includes('round of 32'))return 'Round of 32';
  if(low.includes('round of 16'))return 'Round of 16';
  if(low.includes('first round'))return 'First Round';
  return raw;
}


// ---------- KSM v3.9.1 Adaptive Court Context + Team Queue ----------

// Presentation metadata is explicitly defined for every supported single-elimination
// competitor count. The renderer does not infer or calculate the split.
const SINGLE_ELIM_CONTEXT_LAYOUTS = {
  2:{left:[],right:['Final']},
  3:{left:['Semifinal'],right:['Final']},
  4:{left:['Semifinal'],right:['Final']},
  5:{left:['Quarterfinal'],right:['Semifinal','Final']},
  6:{left:['Quarterfinal'],right:['Semifinal','Final']},
  7:{left:['Quarterfinal'],right:['Semifinal','Final']},
  8:{left:['Quarterfinal'],right:['Semifinal','Final']},
  9:{left:['Play-in','Quarterfinal'],right:['Semifinal','Final']},
  10:{left:['Play-in','Quarterfinal'],right:['Semifinal','Final']},
  11:{left:['Play-in','Quarterfinal'],right:['Semifinal','Final']},
  12:{left:['Play-in','Quarterfinal'],right:['Semifinal','Final']},
  13:{left:['Play-in','Quarterfinal'],right:['Semifinal','Final']},
  14:{left:['Play-in','Quarterfinal'],right:['Semifinal','Final']},
  15:{left:['Play-in','Quarterfinal'],right:['Semifinal','Final']},
  16:{left:['Round of 16'],right:['Quarterfinal','Semifinal','Final']},
  17:{left:['Play-in','Round of 16'],right:['Quarterfinal','Semifinal','Final']},
  18:{left:['Play-in','Round of 16'],right:['Quarterfinal','Semifinal','Final']},
  19:{left:['Play-in','Round of 16'],right:['Quarterfinal','Semifinal','Final']},
  20:{left:['Play-in','Round of 16'],right:['Quarterfinal','Semifinal','Final']},
  21:{left:['Play-in','Round of 16'],right:['Quarterfinal','Semifinal','Final']},
  22:{left:['Play-in','Round of 16'],right:['Quarterfinal','Semifinal','Final']},
  23:{left:['Play-in','Round of 16'],right:['Quarterfinal','Semifinal','Final']},
  24:{left:['Play-in','Round of 16'],right:['Quarterfinal','Semifinal','Final']},
  25:{left:['Play-in','Round of 16'],right:['Quarterfinal','Semifinal','Final']},
  26:{left:['Play-in','Round of 16'],right:['Quarterfinal','Semifinal','Final']},
  27:{left:['Play-in','Round of 16'],right:['Quarterfinal','Semifinal','Final']},
  28:{left:['Play-in','Round of 16'],right:['Quarterfinal','Semifinal','Final']},
  29:{left:['Play-in','Round of 16'],right:['Quarterfinal','Semifinal','Final']},
  30:{left:['Play-in','Round of 16'],right:['Quarterfinal','Semifinal','Final']},
  31:{left:['Play-in','Round of 16'],right:['Quarterfinal','Semifinal','Final']},
  32:{left:['Round of 32','Round of 16'],right:['Quarterfinal','Semifinal','Final']}
};

function setCourtSupportMode(mode){
  const grid=document.querySelector('#score .sk-support-grid');
  const queueCard=document.querySelector('#score .sk-queue-card');
  if(!grid||!queueCard)return;
  const single=mode==='singleElim';
  const splitSingle=single&&divisionCourtMode(state.currentDivision)==='split';
  grid.classList.toggle('single-elim-mode',single&&!splitSingle);
  queueCard.classList.toggle('hidden',single&&!splitSingle);
}









// ---------- KSM v3.9.1 Active navigation state ----------
function setActiveNavForView(viewId){
  /* ksm:post-split-begin react-shell */ksmSetActiveNav(viewId);/* ksm:post-split-end */
}

const originalShowForNav=show;
show=function(id){
  originalShowForNav(id);
  setActiveNavForView(id);
};


