// SemVer stays the single source of truth for Electron Builder and updater.
export const visualVersion = (technical: string) => {
  const parts = technical.split('.').map(Number);
  if (parts.length !== 3 || parts.some(part => !Number.isInteger(part)) || parts[0] < 20) return technical;
  return `${parts[0]}.${String(parts[1]).padStart(2, '0')}.${String(parts[2]).padStart(3, '0')}`;
};
