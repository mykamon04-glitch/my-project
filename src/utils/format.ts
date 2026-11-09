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
