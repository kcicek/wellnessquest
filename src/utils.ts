// Utility helpers
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function evalExpression(expr: string, context: Record<string, any>): number {
  // Extremely small helper to evaluate simple arithmetic expressions referencing context keys.
  // Not secure for untrusted input; fine for controlled game formulas.
  const func = new Function(...Object.keys(context), `return (${expr});`);
  return func(...Object.values(context));
}

export function formatDelta(v: number): string {
  if (v === 0) return '0';
  return v > 0 ? `+${v}` : `${v}`;
}
