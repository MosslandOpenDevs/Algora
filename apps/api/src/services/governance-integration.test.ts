import { describe, it, expect, vi } from 'vitest';
import { DocumentManager, DocumentValidationError } from '@algora/document-registry';

// The 2026-08-05 incident: integrateWithGovernanceOS() created a DP document
// before calling handleAgoraSessionCompleted(), both inside ONE try/catch. A
// decision-packet recommendation over 500 characters made document creation
// throw, the throw skipped the rest of the method, and the proposal that
// should have followed was never created — a cosmetic document silently
// killed the deliberation → proposal path for 52% of decision packets.
//
// Constructing AgoraService pulls in the LLM queue, summoning and boot
// recovery, so this reproduces the control flow of that method against stubs.
// It fails against the pre-fix single-try shape and passes with the isolated
// inner try/catch.

type Deps = {
  createDocument: () => Promise<{ id: string }>;
  handleSessionCompleted: () => Promise<void>;
  runPipeline: () => Promise<void>;
};

/** Mirrors the post-fix structure of AgoraService.integrateWithGovernanceOS. */
async function integrate(deps: Deps, hasIssue: boolean): Promise<void> {
  try {
    try {
      await deps.createDocument();
    } catch (docError) {
      // A document records the deliberation; governance must still advance.
      void docError;
    }

    if (hasIssue) {
      try {
        await deps.runPipeline();
      } catch (pipelineError) {
        void pipelineError;
      }
    }

    await deps.handleSessionCompleted();
  } catch {
    // outer guard
  }
}

function makeDeps(overrides: Partial<Deps> = {}): Deps & { handleSessionCompleted: ReturnType<typeof vi.fn> } {
  const handleSessionCompleted = vi.fn(async () => {});
  return {
    createDocument: async () => ({ id: 'DOC-DP-1' }),
    runPipeline: async () => {},
    handleSessionCompleted,
    ...overrides,
  } as Deps & { handleSessionCompleted: ReturnType<typeof vi.fn> };
}

describe('governance integration after a session completes', () => {
  it('still runs the governance handler when DP document creation throws', async () => {
    const deps = makeDeps({
      createDocument: async () => {
        throw new DocumentValidationError('summary', 'Must be at most 500 characters');
      },
    });

    await integrate(deps, true);

    // The whole point: proposal creation lives behind this call.
    expect(deps.handleSessionCompleted).toHaveBeenCalledTimes(1);
  });

  it('still runs the governance handler when the pipeline throws', async () => {
    const deps = makeDeps({
      runPipeline: async () => {
        throw new Error('pipeline exploded');
      },
    });

    await integrate(deps, true);

    expect(deps.handleSessionCompleted).toHaveBeenCalledTimes(1);
  });

  it('runs the governance handler on the happy path', async () => {
    const deps = makeDeps();
    await integrate(deps, true);
    expect(deps.handleSessionCompleted).toHaveBeenCalledTimes(1);
  });
});

describe('clamped fields survive the real document validator', () => {
  // Guards the other half of the fix: the values the API now passes are
  // produced by the same manager that validates them, so the bounds cannot
  // drift apart.
  const documents = new DocumentManager();

  it('accepts an over-long LLM recommendation once clamped', async () => {
    const recommendation = 'Recommend proceeding with the proposed mitigation across all affected systems. '.repeat(15);
    expect(recommendation.length).toBeGreaterThan(500);

    const doc = await documents.create({
      type: 'DP',
      title: documents.clampTitle('Decision Packet: [Auto] [Security Breach Alert] incident', 'abc12345'),
      summary: documents.clampSummary(recommendation, 'Decision packet for Agora session abc12345.'),
      content: JSON.stringify({ recommendation }), // full text is preserved here
      createdBy: 'test',
    });

    expect(doc.id).toMatch(/^DOC-DP-/);
    expect(JSON.parse(doc.content).recommendation).toBe(recommendation);
  });

  it('accepts a too-short generated summary once clamped', async () => {
    const short = 'Detected issue in category ai with low priority';
    expect(short.length).toBeLessThan(50);

    const doc = await documents.create({
      type: 'RM',
      title: documents.clampTitle('Issue Report: Hack', 'abc12345'),
      summary: documents.clampSummary(short, 'Auto-detected by the anomaly pattern from collected signals.'),
      content: '{}',
      createdBy: 'test',
    });

    expect(doc.summary.length).toBeGreaterThanOrEqual(50);
  });
});
