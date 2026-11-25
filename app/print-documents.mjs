// Add a document here; Vite, the worker and PDF tooling share this registry.
export const printDocuments = { 'scorekeeper-guide': 'print/scorekeeper-guide.html' };
export function printDocumentPage(pathname) {
  const name = pathname.replace(/^\/print\//, '').replace(/\/$/, '');
  return pathname.startsWith('/print/') && Object.hasOwn(printDocuments, name) ? printDocuments[name] : null;
}
