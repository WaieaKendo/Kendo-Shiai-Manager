/* ksm:post-split-begin react-library */
// ==========================================================
// React Tournament Library (app/react/library/, roadmap M.13)
// The Tournament Library, the home page the app boots to (#home, body.ksm-home), is drawn by one
// React island: the contents of #home .home-shell (the brand, "Your Tournaments" with
// ＋ New Tournament, and #homeTournamentLibrary with a card per tournament or one message),
// mounted by app/react/library/main.tsx. The legacy code still decides what is shown and when:
// showHomePage() and renderHomeTournamentLibrary() (33-staff-session-and-library.js) show the
// device's cache, ask the cloud (the list, or discover with the cached IDs) and paint the answer,
// the error or offline line; paintHomeTournamentLibrary(list,message) calls ksmRenderLibrary()
// below, which publishes the rows and the message as plain data (ksm:library,
// window.ksmLibraryInput). It reads what libraryCardMarkup() read, in the same order (list.length,
// then each row's id and name), so a reply that is not a list fails where it failed before;
// tests/golden/library/*.json (recorded from the legacy renderer) pin the result. Text is what
// esc() showed (ksmText(), String(x||'')), the ID what jsArg() passed (String(x.id??'')).
// The island's buttons call createNewTournament() and openTournamentFromHome(id) (33), as the
// inline handlers did.
// Post-split code: scripts/verify-split.mjs removes the marked regions before it compares.
// ==========================================================
function ksmPublishLibrary(input){
  window.ksmLibraryInput=input;
  window.dispatchEvent(new CustomEvent('ksm:library'));
}
// libraryCardMarkup(x) as data.
function ksmLibraryCard(x){
  return {id:String(x.id??''),name:ksmText(x.name)};
}
// paintHomeTournamentLibrary(list,message) as data: the cards, or the message when there are none.
function ksmRenderLibrary(list,message){
  const cards=list.length?list.map(ksmLibraryCard):[];
  ksmPublishLibrary({kind:'library',cards,message:ksmText(message)});
}
/* ksm:post-split-end */
