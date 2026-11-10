/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BUILDING_CONFIGS } from '../data/gameData';
import type { GameEngine } from './engine';
import { AIArchitectDecision, Building, BuildingType, ConstructionTask } from '../types/game';

/**
 * Multi-build Construction AI (V6.2): up to five independent construction projects at once.
 *
 * Nothing here simulates construction. A project reserves a site and credits, then calls the engine's own
 * `placeBuilding` (which validates the site and deducts the cost exactly once). From then on the building
 * progresses in the engine's normal update loop, and this module only *reads* that state.
 * Costs, build times, power slow-down and placement rules are all the engine's existing ones.
 */

export const MAX_SLOTS = 5;
const PLAN_INTERVAL_S = 1.0;      // a planning cycle runs at most once per game-second
const MAX_SITE_RETRIES = 3;       // re-plans of a project whose site went invalid before it fails
const BLOCK_COOLDOWN_S = 30;      // a building type with no valid site is not retried for this long
const HISTORY_LIMIT = 12;
const SITE_MARGIN = 1;            // free grid cells kept between reserved sites

type Rect = { x: number; y: number; w: number; h: number };
const isPending = (t: ConstructionTask) => t.status === 'planned' || t.status === 'waiting_resources';
export const isActive = (t: ConstructionTask) => isPending(t) || t.status === 'constructing';

export function ensureArchitectState(e: GameEngine): void {
  const a = e.aiArchitect;
  if (!Array.isArray(a.tasks)) a.tasks = [];
  if (!Array.isArray(a.taskHistory)) a.taskHistory = [];
  if (!a.blockedTypes) a.blockedTypes = {};
  if (typeof a.nextTaskSeq !== 'number') a.nextTaskSeq = 1;
  if (typeof a.lastPlanTime !== 'number') a.lastPlanTime = -999;
  a.maxConcurrentConstruction = clampLimit(a.maxConcurrentConstruction);
}

export const clampLimit = (n: number | undefined) => Math.max(1, Math.min(MAX_SLOTS, Math.round(Number.isFinite(n) ? (n as number) : 1)));

export function getLimit(e: GameEngine): number {
  return clampLimit(e.aiArchitect.maxConcurrentConstruction);
}

export function activeTasks(e: GameEngine): ConstructionTask[] {
  ensureArchitectState(e);
  return e.aiArchitect.tasks!.filter(isActive);
}

/** 'off' | 'suggest' | 'auto', derived from the existing enabled flag + doctrine mode. */
export function getConstructionMode(e: GameEngine): 'off' | 'suggest' | 'auto' {
  const a = e.aiArchitect;
  if (!a.enabled || a.mode === 'manual') return 'off';
  return a.mode === 'assisted' ? 'suggest' : 'auto';
}

/** Credits promised to approved projects that have not started yet (so nothing else spends them). */
export function getReservedCredits(e: GameEngine): number {
  ensureArchitectState(e);
  return e.aiArchitect.tasks!.filter(t => isPending(t) && t.approved && !t.charged).reduce((n, t) => n + t.cost, 0);
}

function effectiveReserve(e: GameEngine): number {
  return Math.max(e.aiArchitect.reserveCredits, e.autoProduction.enabled ? e.autoProduction.reserveCredits : 0);
}

function rectOf(type: BuildingType, x: number, y: number, rotation: number): Rect {
  const c = BUILDING_CONFIGS[type];
  const rot = rotation === 90 || rotation === 270;
  return { x, y, w: rot ? c.size.height : c.size.width, h: rot ? c.size.width : c.size.height };
}

function overlaps(a: Rect, b: Rect, margin: number): boolean {
  return a.x < b.x + b.w + margin && a.x + a.w + margin > b.x && a.y < b.y + b.h + margin && a.y + a.h + margin > b.y;
}

function reservedRects(e: GameEngine, exceptId?: string): Rect[] {
  return e.aiArchitect.tasks!
    .filter(t => isPending(t) && t.id !== exceptId)
    .map(t => rectOf(t.type, t.gridX, t.gridY, t.rotation));
}

function logDecision(e: GameEngine, type: BuildingType, action: AIArchitectDecision['action'], reason: string, pos?: { x: number; y: number }) {
  const a = e.aiArchitect;
  const d: AIArchitectDecision = {
    id: `dec_${Math.round(e.gameTime * 1000)}_${Math.random().toString(36).substring(2, 6)}`,
    time: e.gameTime,
    buildingType: type,
    action,
    reason,
    gridPos: pos,
    cost: BUILDING_CONFIGS[type].cost,
  };
  a.decisionsHistory.unshift(d);
  if (a.decisionsHistory.length > 20) a.decisionsHistory.pop();
  a.lastDecisionReason = reason;
  a.lastDecisionTime = e.gameTime;
}

function finish(e: GameEngine, t: ConstructionTask, status: 'completed' | 'failed' | 'cancelled', note?: string) {
  const a = e.aiArchitect;
  t.status = status;
  t.finishedAt = e.gameTime;
  if (note) t.note = note;
  a.tasks = a.tasks!.filter(x => x.id !== t.id);
  a.taskHistory!.unshift({ ...t });
  if (a.taskHistory!.length > HISTORY_LIMIT) a.taskHistory!.length = HISTORY_LIMIT;
}

function freeSlot(e: GameEngine): number {
  const used = new Set(e.aiArchitect.tasks!.filter(isActive).map(t => t.slot));
  for (let s = 1; s <= MAX_SLOTS; s++) if (!used.has(s)) return s;
  return MAX_SLOTS;
}

/** First valid site that does not collide with another project's reserved site (or null). */
function findSite(e: GameEngine, type: BuildingType, exceptId?: string): { x: number; y: number } | null {
  const recs = e.getRecommendedBuildingPositions(type, 0, { limit: 24, reserved: reservedRects(e, exceptId), margin: SITE_MARGIN, ignoreFunds: true });
  return recs.length ? { x: recs[0].gridX, y: recs[0].gridY } : null;
}

function isBlocked(e: GameEngine, type: BuildingType): boolean {
  const until = e.aiArchitect.blockedTypes![type];
  return typeof until === 'number' && until > e.gameTime;
}

/**
 * Runs EVERY frame (cheap): turns real building state into task state.
 * constructing + progress>=1 -> completed (slot freed); building gone -> failed; AI switched off -> pending cancelled.
 */
export function syncConstructionTasks(e: GameEngine): void {
  ensureArchitectState(e);
  const a = e.aiArchitect;
  const mode = getConstructionMode(e);
  for (const t of [...a.tasks!]) {
    if (t.status === 'constructing') {
      const b = e.buildings.find(x => x.id === t.buildingId);
      if (!b || b.hp <= 0) {
        finish(e, t, 'failed', 'Structure was destroyed or removed before completion');
      } else if (b.constructionProgress >= 1) {
        finish(e, t, 'completed');
      } else {
        // watchdog: construction should finish within a few multiples of its build time even at half speed
        const expected = BUILDING_CONFIGS[t.type].buildTime;
        if (t.startedAt !== undefined && e.gameTime - t.startedAt > expected * 4 + 20) {
          finish(e, t, 'failed', 'Construction stalled');
        }
      }
    } else if (isPending(t) && mode === 'off') {
      finish(e, t, 'cancelled', 'Construction AI switched off');
    }
  }
  syncLegacyRecommendation(e);
}

/** Keeps the original "AI ADVICE" banner working in SUGGEST mode: it mirrors the first unapproved project. */
function syncLegacyRecommendation(e: GameEngine) {
  const a = e.aiArchitect;
  const first = a.tasks!.find(t => isPending(t) && !t.approved);
  if (first) {
    a.pendingAssistedRecommendation = {
      id: first.id,
      type: first.type,
      gridX: first.gridX,
      gridY: first.gridY,
      rotation: first.rotation,
      reason: first.reason,
      advantage: 'Reserved site; waiting for your approval',
      cost: first.cost,
    };
  } else if (a.pendingAssistedRecommendation && a.tasks!.some(t => t.id === a.pendingAssistedRecommendation!.id) === false) {
    // only clear a banner that belonged to a task; legacy banners created elsewhere are left alone
    if (String(a.pendingAssistedRecommendation.id).startsWith('ctask_')) a.pendingAssistedRecommendation = null;
  }
}

/** Re-plan a not-yet-started project whose site became invalid (e.g. the player built there manually). */
function replan(e: GameEngine, t: ConstructionTask): void {
  t.retries++;
  if (t.retries > MAX_SITE_RETRIES) {
    e.aiArchitect.blockedTypes![t.type] = e.gameTime + BLOCK_COOLDOWN_S;
    finish(e, t, 'failed', `No valid site for ${BUILDING_CONFIGS[t.type].name} after ${MAX_SITE_RETRIES} attempts`);
    return;
  }
  const site = findSite(e, t.type, t.id);
  if (site) {
    t.gridX = site.x;
    t.gridY = site.y;
  } else {
    e.aiArchitect.blockedTypes![t.type] = e.gameTime + BLOCK_COOLDOWN_S;
    finish(e, t, 'failed', `No valid site for ${BUILDING_CONFIGS[t.type].name}`);
  }
}

/** Plan at most one new project, choosing with the engine's existing doctrine logic. */
function planOne(e: GameEngine): boolean {
  const a = e.aiArchitect;
  const active = a.tasks!.filter(isActive);
  if (active.length >= getLimit(e)) return false;
  // do not pile up more unaffordable projects behind one that is already waiting for credits
  if (active.some(t => t.status === 'waiting_resources')) return false;

  // planned-but-not-built projects are not real buildings yet, so tell the chooser about them
  const virtual: BuildingType[] = active.filter(isPending).map(t => t.type);
  for (let attempt = 0; attempt < 4; attempt++) {
    const pick = e.chooseArchitectBuilding(virtual);
    if (!pick) return false;
    if (isBlocked(e, pick.type)) { virtual.push(pick.type); continue; }
    const site = findSite(e, pick.type);
    if (!site) {
      a.blockedTypes![pick.type] = e.gameTime + BLOCK_COOLDOWN_S;
      logDecision(e, pick.type, 'blocked', `No clear site found for ${BUILDING_CONFIGS[pick.type].name}.`);
      virtual.push(pick.type); // let the doctrine move on to its next priority
      continue;
    }
    const cfg = BUILDING_CONFIGS[pick.type];
    const task: ConstructionTask = {
      id: `ctask_${a.nextTaskSeq!++}`,
      slot: freeSlot(e),
      type: pick.type,
      gridX: site.x,
      gridY: site.y,
      rotation: 0,
      status: 'planned',
      reason: pick.reason,
      approved: getConstructionMode(e) === 'auto',
      cost: cfg.cost,
      charged: false,
      createdAt: e.gameTime,
      retries: 0,
    };
    a.tasks!.push(task);
    if (!task.approved) logDecision(e, pick.type, 'recommended', pick.reason, { x: site.x, y: site.y });
    return true;
  }
  return false;
}

/** Start approved projects in slot order. Earlier waiting projects keep their credits reserved. */
function startReady(e: GameEngine): void {
  const a = e.aiArchitect;
  const reserve = effectiveReserve(e);
  let committed = 0;
  const queue = a.tasks!.filter(t => isPending(t) && t.approved).sort((x, y) => x.slot - y.slot);
  for (const t of queue) {
    if (t.charged) continue; // never charge twice
    const available = e.economy.credits - reserve - committed;
    if (available < t.cost) {
      t.status = 'waiting_resources'; // wait; no placement attempts until it is affordable
      committed += t.cost;
      continue;
    }
    const placed: Building | null = e.placeBuilding(t.type, t.gridX, t.gridY, 'player', t.rotation);
    if (placed) {
      t.charged = true; // placeBuilding deducted the cost exactly once
      t.status = 'constructing';
      t.buildingId = placed.id;
      t.startedAt = e.gameTime;
      e.floatingTexts.push({
        id: Math.random().toString(),
        x: placed.pixelX,
        y: placed.pixelY - 32,
        text: `AI ARCHITECT: +${BUILDING_CONFIGS[t.type].name.toUpperCase()}`,
        color: '#38bdf8',
        life: 0,
        maxLife: 2.5,
      });
      e.addStrategicLogEntry(`AI Base Architect started ${BUILDING_CONFIGS[t.type].name} in slot ${t.slot} (${t.reason}).`, 'success');
      logDecision(e, t.type, 'built', t.reason, { x: t.gridX, y: t.gridY });
    } else {
      replan(e, t); // site was invalid: bounded retries, then failure
    }
  }
}

/** Called from the engine's AI Architect tick. */
export function planAndStartConstruction(e: GameEngine): void {
  ensureArchitectState(e);
  const a = e.aiArchitect;
  if (getConstructionMode(e) === 'off' || a.isPaused) return;

  if (getConstructionMode(e) === 'auto') {
    for (const t of a.tasks!.filter(x => isPending(x) && !x.approved)) t.approved = true;
  }

  // 1) pending sites must still be valid (a manual build may have taken the spot)
  for (const t of [...a.tasks!]) {
    if (isPending(t)) {
      const ok = e.canPlaceBuilding(t.type, t.gridX, t.gridY, 'player', undefined, t.rotation, true).valid; // site only: money is handled when starting
      if (!ok) replan(e, t);
    }
  }

  // 2) planning cycle: fill free slots, one project at a time. After each plan, affordability is re-checked so
  //    projects that cannot be paid for wait (and reserve their credits) instead of piling up.
  if (e.gameTime - (a.lastPlanTime ?? -999) >= PLAN_INTERVAL_S) {
    a.lastPlanTime = e.gameTime;
    for (let i = 0; i < MAX_SLOTS; i++) {
      if (!planOne(e)) break;
      startReady(e);
    }
  }

  // 3) start whatever is approved and affordable
  startReady(e);
  syncLegacyRecommendation(e);
}

// ───────────────────────── player actions ─────────────────────────

export function approveTask(e: GameEngine, id: string): boolean {
  ensureArchitectState(e);
  const t = e.aiArchitect.tasks!.find(x => x.id === id);
  if (!t || !isPending(t) || t.approved) return false;
  t.approved = true;
  e.addStrategicLogEntry(`Commander approved ${BUILDING_CONFIGS[t.type].name} construction.`, 'success');
  startReady(e);
  syncLegacyRecommendation(e);
  return true;
}

export function approveAllTasks(e: GameEngine): number {
  ensureArchitectState(e);
  let n = 0;
  for (const t of e.aiArchitect.tasks!.filter(x => isPending(x) && !x.approved)) {
    t.approved = true;
    n++;
  }
  if (n) startReady(e);
  syncLegacyRecommendation(e);
  return n;
}

/**
 * Cancel exactly one project; the others are untouched.
 * Pending: just released (no credits were spent). Constructing: the real building is removed through the
 * engine's existing demolish rule (50% refund), then the slot is freed.
 */
export function cancelTask(e: GameEngine, id: string): boolean {
  ensureArchitectState(e);
  const t = e.aiArchitect.tasks!.find(x => x.id === id);
  if (!t || !isActive(t)) return false;
  if (t.status === 'constructing' && t.buildingId) {
    const b = e.buildings.find(x => x.id === t.buildingId);
    if (b && b.constructionProgress < 1) e.demolishBuilding(b.id);
  }
  e.aiArchitect.blockedTypes![t.type] = Math.max(e.aiArchitect.blockedTypes![t.type] ?? 0, e.gameTime + BLOCK_COOLDOWN_S); // do not restart at once
  finish(e, t, 'cancelled', 'Cancelled by commander');
  syncLegacyRecommendation(e);
  return true;
}

/** OFF / SUGGEST / AUTO, expressed through the engine's existing `enabled` flag and doctrine mode. */
export function setConstructionMode(e: GameEngine, mode: 'off' | 'suggest' | 'auto'): void {
  ensureArchitectState(e);
  const a = e.aiArchitect;
  if (mode === 'off') {
    a.enabled = false;
  } else if (mode === 'suggest') {
    if (a.mode !== 'assisted' && a.mode !== 'manual') a.lastAutoDoctrine = a.mode;
    a.enabled = true;
    a.mode = 'assisted';
  } else {
    a.enabled = true;
    if (a.mode === 'assisted' || a.mode === 'manual') a.mode = a.lastAutoDoctrine ?? 'balanced';
    for (const t of a.tasks!.filter(x => isPending(x) && !x.approved)) t.approved = true; // AUTO manages them itself
  }
  syncConstructionTasks(e);
}

export function setConstructionLimit(e: GameEngine, n: number): number {
  ensureArchitectState(e);
  e.aiArchitect.maxConcurrentConstruction = clampLimit(n);
  return e.aiArchitect.maxConcurrentConstruction;
}

// ───────────────────────── read-only views for the dashboard ─────────────────────────

export function taskProgress(e: GameEngine, t: ConstructionTask): number {
  if (t.status === 'completed') return 1;
  if (t.status !== 'constructing') return 0;
  const b = e.buildings.find(x => x.id === t.buildingId);
  return b ? Math.max(0, Math.min(1, b.constructionProgress)) : 0;
}

/** Remaining game seconds, using the same rate the engine applies (half speed during a power deficit). */
export function estimateRemainingSeconds(e: GameEngine, t: ConstructionTask): number | null {
  if (t.status === 'completed') return 0;
  if (t.status !== 'constructing') return null;
  const speed = e.economy.powerSupply < e.economy.powerDemand ? 0.5 : 1;
  return Math.max(0, ((1 - taskProgress(e, t)) * BUILDING_CONFIGS[t.type].buildTime) / speed);
}

export interface SlotView {
  slot: number;
  task: ConstructionTask | null;
  name: string;
  progress: number;      // 0..1
  etaSeconds: number | null;
  statusLabel: string;
}

const STATUS_LABEL: Record<ConstructionTask['status'], string> = {
  planned: 'Planned',
  waiting_resources: 'Waiting for resources',
  constructing: 'Constructing',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export function getSlotViews(e: GameEngine): SlotView[] {
  ensureArchitectState(e);
  const act = e.aiArchitect.tasks!.filter(isActive);
  const out: SlotView[] = [];
  for (let s = 1; s <= MAX_SLOTS; s++) {
    const task = act.find(t => t.slot === s) ?? null;
    out.push({
      slot: s,
      task,
      name: task ? BUILDING_CONFIGS[task.type].name : '',
      progress: task ? taskProgress(e, task) : 0,
      etaSeconds: task ? estimateRemainingSeconds(e, task) : null,
      statusLabel: task ? (task.status === 'planned' && !task.approved ? 'Awaiting approval' : STATUS_LABEL[task.status]) : 'Free',
    });
  }
  return out;
}
