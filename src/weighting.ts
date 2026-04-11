import type { CalibrationScore, StakeMagnitude } from './types.js';

const DEFAULT_HALF_LIVES: Record<string, number> = {
  'code.correctness': 180,
  'security.policy': 90,
  'api.compatibility': 30,
  'code.style': 365,
};

const FALLBACK_HALF_LIFE = 90;

const STAKE_FACTORS: Record<StakeMagnitude, number> = {
  high: 1.00,
  medium: 0.85,
  low: 0.50,
};

export function computeWeight(
  authority: number,
  calibration: CalibrationScore,
  decisionClass: string,
  magnitude: StakeMagnitude,
  halfLifeOverrides?: Record<string, number>,
): number {
  const effectiveCal = applySampleSizeDiscount(calibration.value, calibration.sampleSize);
  const decay = computeDecay(calibration.staleness, decisionClass, halfLifeOverrides);
  const sf = stakeFactor(magnitude);
  return authority * effectiveCal * decay * sf;
}

export function computeDecay(
  stalenessMs: number,
  decisionClass: string,
  halfLifeOverrides?: Record<string, number>,
): number {
  const hlDays = getHalfLife(decisionClass, halfLifeOverrides);
  if (hlDays <= 0) return 1.0;
  const stalenessDays = stalenessMs / (1000 * 60 * 60 * 24);
  return Math.pow(2.0, -stalenessDays / hlDays);
}

export function applySampleSizeDiscount(value: number, sampleSize: number): number {
  return value * (1.0 - 1.0 / (1.0 + sampleSize));
}

export function stakeFactor(magnitude: StakeMagnitude): number {
  return STAKE_FACTORS[magnitude] ?? 0.50;
}

function getHalfLife(decisionClass: string, overrides?: Record<string, number>): number {
  if (overrides && decisionClass in overrides) return overrides[decisionClass];
  return DEFAULT_HALF_LIVES[decisionClass] ?? FALLBACK_HALF_LIFE;
}
