// The Results screen's functions are in app/modules/results/results-screen.js. These stay: `show` is assigned here
// (tests and later files wrap it too), which a module cannot do.
const originalShowForResults=show;
show=function(id){
  originalShowForResults(id);
  if(id==='results')renderResultsDashboard();
};
document.addEventListener('keydown',function(event){
  if(event.key==='Escape')closeResultsBracket();
});
