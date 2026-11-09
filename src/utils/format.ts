/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Robust numeric health formatting. Prevents NaN, Infinity, and floating-point clutter.
 * Example: 94.88789999999949 / 120 -> "95/120 HP"
 */
export function formatHp(hp: number | undefined, maxHp: number | undefined): string {
  const safeMax = Math.max(1, Math.round(Number.isFinite(maxHp) ? (maxHp as number) : 100));
  const safeHp = Math.max(0, Math.min(safeMax, Math.round(Number.isFinite(hp) ? (hp as number) : 0)));
  return `${safeHp}/${safeMax} HP`;
}

export function getHpPercent(hp: number | undefined, maxHp: number | undefined): number {
  const safeMax = Math.max(1, Number.isFinite(maxHp) ? (maxHp as number) : 100);
  const safeHp = Math.max(0, Math.min(safeMax, Number.isFinite(hp) ? (hp as number) : 0));
  return Math.round((safeHp / safeMax) * 100);
}

export function getHpColor(hp: number | undefined, maxHp: number | undefined): string {
  const pct = getHpPercent(hp, maxHp);
  if (pct > 50) return '#38B98A'; // emerald
  if (pct > 25) return '#F2B84B'; // amber/yellow
  return '#E45B63'; // rose/red
}

export function getUnitStatusText(command: string | undefined, isMoving?: boolean, isAttacking?: boolean): string {
  if (isAttacking) return 'Engaging Target';
  if (isMoving) return 'Advancing';
  switch (command) {
    case 'attack':
    case 'attack_move':
      return 'Combat Ready';
    case 'defend':
    case 'guard':
      return 'Guarding Sector';
    case 'patrol':
      return 'Patrolling';
    case 'hold':
      return 'Holding Position';
    case 'retreat':
      return 'Falling Back';
    case 'heal':
    case 'auto_heal':
      return 'Field Triage';
    case 'repair':
      return 'Field Repairs';
    case 'stop':
      return 'Halted';
    default:
      return 'Standing By';
  }
}

/** Compact display numbers for tight HUD chips: 3,047 / 12.4K / 392K / 1.2M. Exact values stay in detail views. */
export function formatCompact(n: number | undefined): string {
  const v = Number.isFinite(n) ? Math.floor(n as number) : 0;
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (a < 10000) return sign + a.toLocaleString('en-US');
  if (a < 1_000_000) return sign + (a < 100000 ? (a / 1000).toFixed(1).replace(/\.0$/, '') : Math.round(a / 1000)) + 'K';
  return sign + (a / 1_000_000).toFixed(a < 10_000_000 ? 2 : 1).replace(/\.?0+$/, '') + 'M';
}

/** Always-signed value (+50 / -120 / 0) for net power or income rates. */
export function formatSigned(n: number | undefined): string {
  const v = Math.round(Number.isFinite(n) ? (n as number) : 0);
  return (v > 0 ? '+' : v < 0 ? '-' : '') + formatCompact(Math.abs(v));
}
