// Reuse the light theme tokens without depending on the first stylesheet rule.
export function printTheme(css) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const root = withoutComments.match(/(?:^|})\s*:root\s*\{([^{}]*)\}/);
  if (!root) throw new Error('Print theme requires a :root{...} token block');
  return ':root{' + root[1] + '}';
}
