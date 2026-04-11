import { describe, it, expect } from 'vitest';
import {
  Proposal, AgentRegistration, CalibrationScore, Vote,
  createDissentCondition, falsifyCondition, amendCondition,
  currentVote, revise, withDissentCondition, computeWeight,
  DeliberationOrchestrator,
} from '../src/index.js';

const DLB = 'dlb_01HMXJ3E9R';
const TEST_RUNNER = 'did:adp:test-runner-v2';
const SCANNER = 'did:adp:security-scanner-v3';
const LINTER = 'did:adp:style-linter-v1';
const MS_PER_DAY = 86400000;

const AGENTS: AgentRegistration[] = [
  { agentId: TEST_RUNNER, authority: 0.90, calibration: { value: 0.85, sampleSize: 312, staleness: 18 * MS_PER_DAY }, decisionClass: 'code.correctness' },
  { agentId: SCANNER, authority: 0.85, calibration: { value: 0.83, sampleSize: 187, staleness: 12 * MS_PER_DAY }, decisionClass: 'security.policy' },
  { agentId: LINTER, authority: 0.30, calibration: { value: 0.72, sampleSize: 89, staleness: 4 * MS_PER_DAY }, decisionClass: 'code.style' },
];

const ACTION = { kind: 'merge_pull_request', target: 'github.com/acme/api#4471', parameters: { strategy: 'squash' } };

function buildProposals(): Record<string, Proposal> {
  const base = { deliberationId: DLB, timestamp: '2026-04-11T14:32:09Z', action: ACTION, reversibilityTier: 'partially_reversible' as const, blastRadius: { scope: ['service:api'], estimatedUsersAffected: 12000, rollbackCostSeconds: 90 } };
  return {
    [TEST_RUNNER]: { ...base, proposalId: 'prp_01', agentId: TEST_RUNNER, vote: 'approve', confidence: 0.86, domainClaim: { domain: 'code.correctness', authoritySource: 'mcp' }, justification: { summary: 'Tests pass', evidenceRefs: [] }, stake: { declaredBy: 'self', magnitude: 'high', calibrationAtStake: true }, dissentConditions: [createDissentCondition('dc_tr_01', 'if any test marked critical regresses'), createDissentCondition('dc_tr_02', 'if coverage delta is negative')], revisions: [] },
    [SCANNER]: { ...base, proposalId: 'prp_02', agentId: SCANNER, vote: 'reject', confidence: 0.79, domainClaim: { domain: 'security.policy', authoritySource: 'mcp' }, justification: { summary: 'Untested paths', evidenceRefs: [] }, stake: { declaredBy: 'self', magnitude: 'high', calibrationAtStake: true }, dissentConditions: [createDissentCondition('dc_ss_01', 'if any code path in auth module remains untested'), createDissentCondition('dc_ss_02', 'if no security-focused test covers token validation')], revisions: [] },
    [LINTER]: { ...base, proposalId: 'prp_03', agentId: LINTER, vote: 'approve', confidence: 0.62, domainClaim: { domain: 'code.style', authoritySource: 'mcp' }, justification: { summary: 'Minor deviations', evidenceRefs: [] }, stake: { declaredBy: 'self', magnitude: 'medium', calibrationAtStake: true }, dissentConditions: [createDissentCondition('dc_sl_01', 'if any public API name violates naming convention')], revisions: [] },
  };
}

describe('ADP PR Merge Scenario', () => {
  it('weights match spec section 8.1', () => {
    const orch = new DeliberationOrchestrator();
    const proposals = buildProposals();
    const weights = orch.computeWeights(AGENTS, Object.values(proposals));
    expect(weights[TEST_RUNNER]).toBeGreaterThanOrEqual(0.70);
    expect(weights[TEST_RUNNER]).toBeLessThanOrEqual(0.72);
    expect(weights[SCANNER]).toBeGreaterThanOrEqual(0.63);
    expect(weights[SCANNER]).toBeLessThanOrEqual(0.65);
    expect(weights[LINTER]).toBeGreaterThanOrEqual(0.17);
    expect(weights[LINTER]).toBeLessThanOrEqual(0.19);
  });

  it('round 0 tally fails threshold', () => {
    const orch = new DeliberationOrchestrator();
    const proposals = buildProposals();
    const weights = orch.computeWeights(AGENTS, Object.values(proposals));
    const tally = orch.tally(proposals, weights, 'partially_reversible');
    expect(tally.converged).toBe(false);
    expect(tally.participationFloorMet).toBe(true);
    expect(tally.thresholdMet).toBe(false);
    expect(tally.approvalFraction).toBeGreaterThanOrEqual(0.57);
    expect(tally.approvalFraction).toBeLessThan(0.60);
  });

  it('after belief-update scanner abstains and deliberation converges', () => {
    const orch = new DeliberationOrchestrator();
    const proposals = buildProposals();
    const weights = orch.computeWeights(AGENTS, Object.values(proposals));
    let updated = withDissentCondition(proposals[SCANNER], 'dc_ss_01', dc => falsifyCondition(dc, 1, TEST_RUNNER));
    updated = withDissentCondition(updated, 'dc_ss_02', dc => falsifyCondition(dc, 1, TEST_RUNNER));
    updated = revise(updated, 1, 'abstain', null, 'Conditions falsified.');
    expect(updated.dissentConditions[0].status).toBe('falsified');
    expect(currentVote(updated)).toBe('abstain');
    const tally = orch.tally({ ...proposals, [SCANNER]: updated }, weights, 'partially_reversible');
    expect(tally.converged).toBe(true);
    expect(tally.approvalFraction).toBe(1.0);
  });

  it('counterfactual: linter abstains, participation floor fails', () => {
    const orch = new DeliberationOrchestrator();
    const proposals = buildProposals();
    const weights = orch.computeWeights(AGENTS, Object.values(proposals));
    const scannerAbstains = revise(proposals[SCANNER], 1, 'abstain', null, '');
    const linterAbstains = revise(proposals[LINTER], 1, 'abstain', null, '');
    const tally = orch.tally({ ...proposals, [SCANNER]: scannerAbstains, [LINTER]: linterAbstains }, weights, 'partially_reversible');
    expect(tally.converged).toBe(false);
    expect(tally.participationFloorMet).toBe(false);
    expect(tally.participationFraction).toBeGreaterThanOrEqual(0.45);
    expect(tally.participationFraction).toBeLessThanOrEqual(0.48);
    expect(orch.determineTermination(tally, true)).toBe('partial_commit');
    expect(orch.determineTermination(tally, false)).toBe('deadlocked');
  });

  it('linter participation is the margin', () => {
    const orch = new DeliberationOrchestrator();
    const proposals = buildProposals();
    const weights = orch.computeWeights(AGENTS, Object.values(proposals));
    const scannerAbstains = revise(proposals[SCANNER], 1, 'abstain', null, '');
    const withLinter = orch.tally({ ...proposals, [SCANNER]: scannerAbstains }, weights, 'partially_reversible');
    const withoutLinter = orch.tally({ ...proposals, [SCANNER]: scannerAbstains, [LINTER]: revise(proposals[LINTER], 1, 'abstain', null, '') }, weights, 'partially_reversible');
    expect(withLinter.converged).toBe(true);
    expect(withoutLinter.converged).toBe(false);
  });

  it('dissent condition amendment is append-only', () => {
    const proposals = buildProposals();
    const amended = withDissentCondition(proposals[SCANNER], 'dc_ss_01', dc => amendCondition(dc, 1, 'if critical path untested', 'Non-critical excluded.', TEST_RUNNER));
    const dc = amended.dissentConditions[0];
    expect(dc.status).toBe('amended');
    expect(dc.amendments).toHaveLength(1);
    expect(dc.condition).toBe('if any code path in auth module remains untested');
    expect(dc.amendments[0].newCondition).toBe('if critical path untested');
  });

  it('tier escalation raises threshold', () => {
    const t1 = DeliberationOrchestrator.getThreshold('partially_reversible');
    const t2 = DeliberationOrchestrator.getThreshold('irreversible');
    expect(t1).toBeCloseTo(0.60, 2);
    expect(t2).toBeCloseTo(0.667, 2);
    expect(t2).toBeGreaterThan(t1);
  });

  it('bootstrap agent has near-zero weight', () => {
    const cal: CalibrationScore = { value: 0.5, sampleSize: 0, staleness: 0 };
    const w = computeWeight(0.90, cal, 'code.correctness', 'high');
    expect(Math.abs(w)).toBeLessThan(1e-10);
  });
});
