export function labLoadFraction(loaded = 0, total = 0) {
  return total > 0 ? Math.min(1, Math.max(0, loaded / total)) : undefined;
}
