export const isTestMode = () =>
  (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env?.ICHAVEIRO_TEST_MODE === '1';
