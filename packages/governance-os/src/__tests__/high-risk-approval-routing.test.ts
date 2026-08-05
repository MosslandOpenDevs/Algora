// ===========================================
// Regression tests: HIGH-risk approval routing
// ===========================================
// A HIGH-risk pipeline used to fail at approval_routing because the pipeline raises
// an action type ('pipeline_execution') that dual-house did not allow, so every run
// errored out and the issue was requeued into the same failure. Fixing the allow-list
// alone was not enough: the execution gate checked the Safe Autonomy lock id (lock-*)
// against approvals stored under their own id (hr-*), so execution stayed blocked
// however many houses signed off. Blocked contexts were also dropped in a finally
// block, leaving nothing for resume() to find.

import { describe, it, expect, beforeEach } from 'vitest';
import { GovernanceOS, createGovernanceOS } from '../index.js';

/** Fresh params per run — the pipeline records run state into the context metadata. */
function highRiskRun(issueId = 'issue-high-risk') {
  return {
    issueId,
    workflowType: 'A' as const,
    riskLevel: 'HIGH' as const,
    metadata: { test: true },
  };
}

/**
 * Sign off both houses. recordHouseApproval() unlocks on its own once nothing is
 * outstanding, so this asserts the end state rather than calling unlock() as well.
 */
async function approveBothHouses(
  governanceOS: GovernanceOS,
  approvalId: string
): Promise<void> {
  const highRisk = governanceOS.getDualHouse().highRisk;
  highRisk.setDirector3Required(false);
  await highRisk.recordHouseApproval(approvalId, 'mosscoin');
  await highRisk.recordHouseApproval(approvalId, 'opensource');

  const approval = await highRisk.getApproval(approvalId);
  expect(approval?.lockStatus).toBe('UNLOCKED');
}

describe('HIGH-risk approval routing', () => {
  let governanceOS: GovernanceOS;

  beforeEach(() => {
    governanceOS = createGovernanceOS();
  });

  it("allows the pipeline's own action type", () => {
    expect(
      governanceOS.getDualHouse().highRisk.getAllowedActionTypes()
    ).toContain('pipeline_execution');
  });

  it('routes approval without erroring the run', async () => {
    const result = await governanceOS.runPipeline(highRiskRun());

    expect(result.status).not.toBe('error');
    expect(result.context.error).toBeUndefined();
    expect(result.context.completedStages).toContain('approval_routing');
    expect(result.context.approvalId).toBeDefined();
    expect(result.context.metadata.approvalRoutingError).toBeUndefined();
  }, 30000);

  it('creates a real dual-house approval for the run', async () => {
    const result = await governanceOS.runPipeline(highRiskRun());

    const approval = await governanceOS
      .getDualHouse()
      .highRisk.getApproval(result.context.approvalId!);

    expect(approval).not.toBeNull();
    expect(approval!.actionType).toBe('pipeline_execution');
    expect(approval!.lockStatus).toBe('LOCKED');
  }, 30000);

  it('blocks execution while the approval is still locked', async () => {
    const result = await governanceOS.runPipeline(highRiskRun());

    expect(result.status).toBe('locked');
    expect(result.context.metadata.executionBlocked).toBe(true);
    // The blocked stage must not count as completed, or resume() would skip it.
    expect(result.context.completedStages).not.toContain('execution');
  }, 30000);

  it('keeps a blocked pipeline available for resume', async () => {
    const result = await governanceOS.runPipeline(highRiskRun());

    expect(governanceOS.getPipeline().getActivePipelineIds()).toContain(
      result.context.id
    );
  }, 30000);

  it('proceeds past the gate once the approval is unlocked', async () => {
    const blocked = await governanceOS.runPipeline(highRiskRun());
    await approveBothHouses(governanceOS, blocked.context.approvalId!);

    const resumed = await governanceOS.resumePipeline(blocked.context.id);

    expect(resumed).not.toBeNull();
    expect(resumed!.status).toBe('completed');
    expect(resumed!.context.metadata.executionBlocked).toBe(false);
    expect(resumed!.context.completedStages).toContain('execution');

    const execution = resumed!.context.metadata.execution as Record<
      string,
      unknown
    >;
    expect(execution.status).toBe('completed');
    expect(execution.approvalStatus).toBe('approved');
  }, 30000);

  it('does not replay already-completed stages on resume', async () => {
    const blocked = await governanceOS.runPipeline(highRiskRun());
    const votingIdBefore = blocked.context.votingId;
    const approvalIdBefore = blocked.context.approvalId;
    const documentsBefore = blocked.context.documents.length;

    await approveBothHouses(governanceOS, approvalIdBefore!);
    const resumed = await governanceOS.resumePipeline(blocked.context.id);

    // Re-running dual_house_review or approval_routing would mint fresh ids and
    // duplicate documents; every stage in this pipeline has side effects.
    expect(resumed!.context.votingId).toBe(votingIdBefore);
    expect(resumed!.context.approvalId).toBe(approvalIdBefore);
    expect(resumed!.context.documents.length).toBe(documentsBefore);
  }, 30000);

  it('releases the pipeline once it reaches a terminal state', async () => {
    const blocked = await governanceOS.runPipeline(highRiskRun());
    await approveBothHouses(governanceOS, blocked.context.approvalId!);
    await governanceOS.resumePipeline(blocked.context.id);

    expect(governanceOS.getPipeline().getActivePipelineIds()).not.toContain(
      blocked.context.id
    );
  }, 30000);

  it('locks under the approval id so the unlock event can find the lock', async () => {
    // execution:locked persists the lock keyed by this id, while execution:unlocked
    // carries the dual-house approval id. Minting a separate lock-* id left the
    // stored lock permanently 'locked' because the two never matched.
    const result = await governanceOS.runPipeline(highRiskRun());

    expect(result.context.lockedActionId).toBe(result.context.approvalId);
    expect(result.context.lockedActionId).toMatch(/^hr-/);
  }, 30000);

  it('returns null when there is no pipeline to resume', async () => {
    await expect(
      governanceOS.resumePipeline('pipe-does-not-exist')
    ).resolves.toBeNull();
  });

  it('adopts the existing approval when a proposal is run again', async () => {
    const first = await governanceOS.runPipeline(highRiskRun());
    const second = await governanceOS.runPipeline(highRiskRun());

    // createApproval rejects a second approval for the same proposal; the rerun must
    // reuse it rather than erroring the whole pipeline.
    expect(second.status).not.toBe('error');
    expect(second.context.approvalId).toBe(first.context.approvalId);
    expect(second.context.metadata.approvalRoutingError).toBeUndefined();
  }, 60000);
});
