import './print.css';
const title = document.title;
const header = document.createElement('header');
header.className = 'document-header';
header.textContent = 'Kendo Shiai Manager · ' + __PRINT_VERSION__;
document.body.prepend(header);
const footer = document.createElement('footer');
footer.textContent = `${title} · Kendo Shiai Manager · ${__PRINT_VERSION__}`;
document.body.append(footer);
// Margin boxes repeat branding on every printed side without covering the content.
const margins = document.createElement('style');
margins.textContent = `@page {
  @top-left { content: ${JSON.stringify(header.textContent)}; font: 8pt system-ui; color: var(--muted); }
  @bottom-left { content: ${JSON.stringify(footer.textContent)}; font: 8pt system-ui; color: var(--muted); }
}`;
document.head.append(margins);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/service-worker.js');
