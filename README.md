# adp-manifest

[![npm](https://img.shields.io/npm/v/@ai-manifests/adp-manifest.svg?label=npm)](https://www.npmjs.com/package/@ai-manifests/adp-manifest)
[![Downloads](https://img.shields.io/npm/dm/@ai-manifests/adp-manifest.svg)](https://www.npmjs.com/package/@ai-manifests/adp-manifest)
[![Node](https://img.shields.io/badge/node-20%2B-blue.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Spec](https://img.shields.io/badge/spec-adp--manifest.dev-informational)](https://adp-manifest.dev)

A TypeScript reference implementation of the **Agent Deliberation Protocol (ADP)** specification — the consensus protocol that multi-agent systems use to reach calibrated, falsifiable decisions together. ADP defines proposals, weights, tallies, falsification, termination, and reversibility tiers.

This library is one of several reference implementations ([Python](https://github.com/ai-manifests/adp-ref-lib-py)) of the same spec. The spec itself is at [adp-manifest.dev](https://adp-manifest.dev) and is the source of truth; this library implements what the spec says.

Zero runtime dependencies. Pure TypeScript, ESM.

> **Looking for a runnable agent?** This library is the protocol core — data types, weighting math, and an in-memory orchestrator. For a full federation-ready agent runtime with HTTP endpoints, journal persistence, Ed25519 signing, signed calibration snapshots, ACB pricing, and MCP integration, install [`@ai-manifests/adp-agent`](https://www.npmjs.com/package/@ai-manifests/adp-agent) instead.

## Install

```bash
npm install @ai-manifests/adp-manifest
```

## Quick example

```ts
import {
  DeliberationOrchestrator,
  computeWeight,
  Vote,
  ReversibilityTier,
  StakeMagnitude,
  type Proposal,
  type CalibrationScore,
} from '@ai-manifests/adp-manifest';

const proposal: Proposal = {
  agentId: 'did:adp:test-runner-v1',
  domain: 'code.correctness',
  vote: Vote.Approve,
  confidence: 0.82,
  stake: { magnitude: StakeMagnitude.Medium, domain: 'code.correctness' },
  justification: { rationale: 'all tests pass', evidenceRefs: [] },
  dissentConditions: [],
};

const calibration: CalibrationScore = { value: 0.78, sampleSize: 42 };
const weight = computeWeight(proposal, calibration);
// weight ≈ 0.82 × 0.78 × stakeFactor('medium') × sampleSizeDiscount(42)
```

## API

All exports are re-exported from the package root.

### Enums & primitive types

`Vote`, `ReversibilityTier`, `DissentConditionStatus`, `TerminationState`, `StakeMagnitude`

### Protocol types

`Proposal`, `ProposalAction`, `BlastRadius`, `DomainClaim`, `Justification`, `Stake`, `DissentCondition`, `VoteRevision`, `Amendment`, `CalibrationScore`, `AgentRegistration`, `TallyResult`

### Weighting functions

- `computeWeight(proposal, calibration)` — canonical proposal weight per ADP §4.2
- `computeDecay(age, halfLife)` — time decay of calibration evidence
- `stakeFactor(magnitude)` — maps `StakeMagnitude` to its numeric factor
- `applySampleSizeDiscount(weight, n)` — Wilson-interval sample-size discount

### Orchestrator

- `DeliberationOrchestrator` — in-memory state machine that runs a deliberation through proposal → tally → falsification → termination. Takes a `DeliberationConfig`. Intended for prototypes, tests, and embedded-in-process use. For production distributed deliberation, see [`@ai-manifests/adp-agent`](https://www.npmjs.com/package/@ai-manifests/adp-agent).

## Testing

```bash
npm test
```

## Spec

This library implements the Agent Deliberation Protocol specification. Read the spec at [adp-manifest.dev](https://adp-manifest.dev). If the spec and this library disagree, the spec is correct and this is a bug.

## License

Apache-2.0 — see [`LICENSE`](LICENSE) for the full license text and [`NOTICE`](NOTICE) for attribution.
