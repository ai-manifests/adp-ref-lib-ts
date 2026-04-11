export type Vote = 'approve' | 'reject' | 'abstain';
export type ReversibilityTier = 'reversible' | 'partially_reversible' | 'irreversible';
export type DissentConditionStatus = 'active' | 'falsified' | 'amended' | 'withdrawn';
export type TerminationState = 'converged' | 'partial_commit' | 'deadlocked';
export type StakeMagnitude = 'low' | 'medium' | 'high';

export interface CalibrationScore {
  readonly value: number;
  readonly sampleSize: number;
  readonly staleness: number; // milliseconds
}

export interface AgentRegistration {
  readonly agentId: string;
  readonly authority: number;
  readonly calibration: CalibrationScore;
  readonly decisionClass: string;
}

export interface Amendment {
  readonly round: number;
  readonly newCondition: string;
  readonly reason: string;
  readonly triggeredBy: string;
}

export interface DissentCondition {
  readonly id: string;
  readonly condition: string;
  readonly status: DissentConditionStatus;
  readonly amendments: readonly Amendment[];
  readonly testedInRound: number | null;
  readonly testedBy: string | null;
}

export function createDissentCondition(id: string, condition: string): DissentCondition {
  return { id, condition, status: 'active', amendments: [], testedInRound: null, testedBy: null };
}

export function falsifyCondition(dc: DissentCondition, round: number, testedBy: string): DissentCondition {
  return { ...dc, status: 'falsified', testedInRound: round, testedBy };
}

export function amendCondition(dc: DissentCondition, round: number, newCondition: string, reason: string, triggeredBy: string): DissentCondition {
  return {
    ...dc, status: 'amended', testedInRound: round, testedBy: triggeredBy,
    amendments: [...dc.amendments, { round, newCondition, reason, triggeredBy }],
  };
}

export interface VoteRevision {
  readonly round: number;
  readonly priorVote: Vote;
  readonly newVote: Vote;
  readonly priorConfidence: number | null;
  readonly newConfidence: number | null;
  readonly reason: string;
  readonly timestamp: string;
}

export interface ProposalAction {
  readonly kind: string;
  readonly target: string;
  readonly parameters?: Readonly<Record<string, string>>;
}

export interface BlastRadius {
  readonly scope: readonly string[];
  readonly estimatedUsersAffected: number;
  readonly rollbackCostSeconds: number;
}

export interface DomainClaim {
  readonly domain: string;
  readonly authoritySource: string;
}

export interface Justification {
  readonly summary: string;
  readonly evidenceRefs: readonly string[];
}

export interface Stake {
  readonly declaredBy: string;
  readonly magnitude: StakeMagnitude;
  readonly calibrationAtStake: boolean;
}

export interface Proposal {
  readonly proposalId: string;
  readonly deliberationId: string;
  readonly agentId: string;
  readonly timestamp: string;
  readonly action: ProposalAction;
  readonly vote: Vote;
  readonly confidence: number;
  readonly domainClaim: DomainClaim;
  readonly reversibilityTier: ReversibilityTier;
  readonly blastRadius: BlastRadius;
  readonly justification: Justification;
  readonly stake: Stake;
  readonly dissentConditions: readonly DissentCondition[];
  readonly revisions: readonly VoteRevision[];
}

export function currentVote(p: Proposal): Vote {
  return p.revisions.length > 0 ? p.revisions[p.revisions.length - 1].newVote : p.vote;
}

export function currentConfidence(p: Proposal): number | null {
  return p.revisions.length > 0 ? p.revisions[p.revisions.length - 1].newConfidence : p.confidence;
}

export function revise(p: Proposal, round: number, newVote: Vote, newConfidence: number | null, reason: string): Proposal {
  const revision: VoteRevision = {
    round, priorVote: currentVote(p), newVote,
    priorConfidence: currentConfidence(p), newConfidence,
    reason, timestamp: new Date().toISOString(),
  };
  return { ...p, revisions: [...p.revisions, revision] };
}

export function withDissentCondition(p: Proposal, conditionId: string, update: (dc: DissentCondition) => DissentCondition): Proposal {
  const idx = p.dissentConditions.findIndex(dc => dc.id === conditionId);
  if (idx < 0) throw new Error(`Dissent condition '${conditionId}' not found.`);
  const newConditions = [...p.dissentConditions];
  newConditions[idx] = update(p.dissentConditions[idx]);
  return { ...p, dissentConditions: newConditions };
}

export interface TallyResult {
  readonly approveWeight: number;
  readonly rejectWeight: number;
  readonly abstainWeight: number;
  readonly totalDeliberationWeight: number;
  readonly approvalFraction: number;
  readonly participationFraction: number;
  readonly thresholdMet: boolean;
  readonly participationFloorMet: boolean;
  readonly domainVetoesClear: boolean;
  readonly converged: boolean;
}
