import type { Proposal, AgentRegistration, TallyResult, ReversibilityTier, TerminationState, Vote } from './types.js';
import { currentVote } from './types.js';
import { computeWeight } from './weighting.js';

export interface DeliberationConfig {
  readonly maxRounds?: number;
  readonly participationFloor?: number;
  readonly domainAuthorityVetoThreshold?: number;
  readonly irreversibleMinAuthority?: number;
  readonly halfLifeOverrides?: Record<string, number>;
}

export class DeliberationOrchestrator {
  private readonly config: Required<Omit<DeliberationConfig, 'halfLifeOverrides'>> & { halfLifeOverrides?: Record<string, number> };

  constructor(config?: DeliberationConfig) {
    this.config = {
      maxRounds: config?.maxRounds ?? 3,
      participationFloor: config?.participationFloor ?? 0.50,
      domainAuthorityVetoThreshold: config?.domainAuthorityVetoThreshold ?? 0.80,
      irreversibleMinAuthority: config?.irreversibleMinAuthority ?? 0.70,
      halfLifeOverrides: config?.halfLifeOverrides,
    };
  }

  computeWeights(agents: readonly AgentRegistration[], proposals: readonly Proposal[]): Record<string, number> {
    const proposalMap = new Map(proposals.map(p => [p.agentId, p]));
    const weights: Record<string, number> = {};
    for (const agent of agents) {
      const proposal = proposalMap.get(agent.agentId);
      if (!proposal) continue;
      weights[agent.agentId] = computeWeight(
        agent.authority, agent.calibration, agent.decisionClass,
        proposal.stake.magnitude, this.config.halfLifeOverrides,
      );
    }
    return weights;
  }

  tally(proposals: Record<string, Proposal>, weights: Record<string, number>, tier: ReversibilityTier): TallyResult {
    let approveWeight = 0, rejectWeight = 0, abstainWeight = 0;

    for (const [agentId, proposal] of Object.entries(proposals)) {
      const weight = weights[agentId] ?? 0;
      const vote = currentVote(proposal);
      if (vote === 'approve') approveWeight += weight;
      else if (vote === 'reject') rejectWeight += weight;
      else if (vote === 'abstain') abstainWeight += weight;
    }

    const total = approveWeight + rejectWeight + abstainWeight;
    const nonAbstaining = approveWeight + rejectWeight;
    const approvalFraction = nonAbstaining > 0 ? approveWeight / nonAbstaining : 0;
    const participationFraction = total > 0 ? nonAbstaining / total : 0;
    const threshold = DeliberationOrchestrator.getThreshold(tier);
    const thresholdMet = approvalFraction >= threshold;
    const participationFloorMet = participationFraction >= this.config.participationFloor;
    const domainVetoesClear = this.checkDomainVetoes(proposals, weights, tier);

    return {
      approveWeight, rejectWeight, abstainWeight,
      totalDeliberationWeight: total,
      approvalFraction, participationFraction,
      thresholdMet, participationFloorMet, domainVetoesClear,
      converged: thresholdMet && participationFloorMet && domainVetoesClear,
    };
  }

  determineTermination(tally: TallyResult, hasReversibleSubset: boolean): TerminationState {
    if (tally.converged) return 'converged';
    return hasReversibleSubset ? 'partial_commit' : 'deadlocked';
  }

  static getThreshold(tier: ReversibilityTier): number {
    switch (tier) {
      case 'reversible': return 0.50 + Number.EPSILON;
      case 'partially_reversible': return 0.60;
      case 'irreversible': return 2.0 / 3.0;
      default: return 0.50 + Number.EPSILON;
    }
  }

  private checkDomainVetoes(proposals: Record<string, Proposal>, weights: Record<string, number>, tier: ReversibilityTier): boolean {
    if (tier === 'reversible') return true;
    const vetoThreshold = tier === 'irreversible' ? this.config.irreversibleMinAuthority : this.config.domainAuthorityVetoThreshold;
    for (const [agentId, proposal] of Object.entries(proposals)) {
      const weight = weights[agentId] ?? 0;
      if (weight >= vetoThreshold && currentVote(proposal) === 'reject') return false;
    }
    return true;
  }
}
