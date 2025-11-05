export {};

// Suppress jsdom CSS parsing errors (Canon uses @layer which jsdom can't parse)
// This must run before modules are loaded, so it lives in setupFiles (not setupFilesAfterEnv)
// eslint-disable-next-line no-console
const originalError = console.error;
// eslint-disable-next-line no-console
console.error = (...args: any[]) => {
  const first = args[0];
  if (
    typeof first === 'string' &&
    first.includes('Could not parse CSS stylesheet')
  )
    return;
  if (
    first instanceof Error &&
    first.message.includes('Could not parse CSS stylesheet')
  )
    return;
  if (
    first &&
    typeof first === 'object' &&
    (first as any).type === 'css parsing'
  )
    return;
  originalError(...args);
};
