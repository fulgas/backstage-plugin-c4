export {};

const originalError = console.error; // eslint-disable-line no-console
console.error = (...args: any[]) => {
  // eslint-disable-line no-console
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
