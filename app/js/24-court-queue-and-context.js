









// ---------- KSM v3.9.1 Active navigation state ----------
function setActiveNavForView(viewId){
  ksmSetActiveNav(viewId);
}

const originalShowForNav=show;
show=function(id){
  originalShowForNav(id);
  setActiveNavForView(id);
};


