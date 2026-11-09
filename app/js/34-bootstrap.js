// Boot (app/modules/boot.js) and the React bridges (app/modules/react-bridges/) load here (step 3d of #136):
// the bootstrap first, then each bridge's load-time listeners, in the order their files used to load (35- to 44-).
initBootstrap();
initReactBridges();
