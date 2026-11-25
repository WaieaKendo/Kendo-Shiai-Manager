
/* ksm:post-split-begin tournament-switcher */var ksmBootstrapInitialization=/* ksm:post-split-end */initializeCloudRoleFromUrl().catch(err=>{/* ksm:post-split-begin tournament-switcher */if(err?.code==='transition-cancelled')return;if(ksmKeepFailedStartup(err))return;if(/\(404\)/.test(err?.message||''))return ksmShowLibrary({deleted:true});/* ksm:post-split-end */console.error('Unable to initialize cloud session',err);setConnectionStatus('Cloud load failed','offline');/* ksm:post-split-begin tournament-switcher */return /* ksm:post-split-end */showHomePage()});
/* ksm:post-split-begin tournament-switcher */
ksmBootstrapInitialization.then(()=>{window.ksmBootstrapReady=true});
/* ksm:post-split-end */
syncSetupHeader();

// Hosted mobile foundation: normal click events are authoritative.
// Direct file opening is unsupported because mobile file previews may block scripts/assets.
if(location.protocol === 'file:'){
  const notice=document.createElement('div');
  notice.setAttribute('role','alert');
  notice.style.cssText='position:fixed;left:12px;right:12px;bottom:12px;z-index:99999;padding:14px 16px;border-radius:12px;background:#222831;color:white;font:700 14px/1.35 system-ui;box-shadow:0 8px 28px rgba(0,0,0,.25)';
  notice.textContent='KSM must be opened from its hosted HTTPS address. Mobile file previews can block buttons and icons.';
  document.body.appendChild(notice);
}

if('serviceWorker' in navigator && location.protocol !== 'file:'){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('/service-worker.js').catch(err=>console.warn('KSM service worker registration failed',err));
  });
}

