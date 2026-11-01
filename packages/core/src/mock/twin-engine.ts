import { ADVICE_CHECKS, citedIndexesIn, runAdviceChecks } from '../compliance/advice-checks';
import { classifyQuestion } from '../compliance/intent';
import type { DraftAttempt, TwinAnswer, TwinStreamEvent } from '../domain/twin';
import { createAnswerId } from '../security/ids';
import { LIBRARY_SIZE, LIBRARY_VERSION, toCitations } from './knowledge';
import {
  adviceRefusal,
  injectionRefusal,
  matchQuestion,
  notCovered,
  SHORTCUT_SCENARIOS,
  type ScenarioContext,
  type ScenarioResult,
} from './scenarios';
import { sleep } from './util';

export const MODELS = { router: 'claude-haiku-5-5', specialist: 'claude-sonnet-5-5' } as const;

/** Account ids belonging to other demo users; the data-leak check fails if any appear. */
const FOREIGN_IDENTIFIERS = ['88213-B', 'ACC-77120'];

export interface EngineTiming {
  /** Multiplier for every simulated delay: 0 in tests, 1 in the demo. */
  speed: number;
}

export function resolveScenario(
  ctx: ScenarioContext,
): ScenarioResult & { intent: ReturnType<typeof classifyQuestion> } {
  const question = ctx.question.trim();
  if (question.startsWith('/')) {
    const [command = '', ...rest] = question.split(/\s+/);
    const builder = SHORTCUT_SCENARIOS[command.toLowerCase()];
    if (builder) return { ...builder({ ...ctx, args: rest.join(' ') }), intent: 'informational' };
  }
  const intent = classifyQuestion(question);
  if (intent === 'injection-attempt') return { ...injectionRefusal(), intent };
  if (intent === 'advice-seeking') return { ...adviceRefusal(ctx), intent };
  const scenario = matchQuestion(question);
  return { ...(scenario ? scenario.build(ctx) : notCovered(ctx)), intent };
}

function chunk(text: string): string[] {
  const parts = text.match(/\S+\s*/g) ?? [];
  const out: string[] = [];
  for (let i = 0; i < parts.length; i += 3) out.push(parts.slice(i, i + 3).join(''));
  return out;
}

export async function* runTwin(
  ctx: ScenarioContext,
  timing: EngineTiming,
  signal?: AbortSignal,
): AsyncGenerator<TwinStreamEvent, TwinAnswer> {
  const started = Date.now();
  const wait = (ms: number) => sleep(ms * timing.speed, signal);

  const result = resolveScenario(ctx);

  await wait(280);
  yield { type: 'routed', specialist: result.specialist, reason: result.routeReason };

  const citations = toCitations(result.passages, ctx.now.getTime());
  await wait(420);
  yield { type: 'retrieved', citations, matched: citations.length, size: LIBRARY_SIZE };

  // Earlier drafts that failed are reported as checks, then discarded. Their text never streams.
  const drafts: DraftAttempt[] = [...(result.blockedDrafts ?? [])];
  for (const blocked of drafts) {
    await wait(500);
    yield {
      type: 'checked',
      attempt: blocked.attempt,
      checks: ADVICE_CHECKS.map(({ id, label }) => ({
        id,
        label,
        passed: !blocked.failedChecks.includes(id),
        detail: blocked.failedChecks.includes(id) ? 'Draft withheld and rewritten' : undefined,
      })),
    };
  }

  // The final draft is checked before display. The UI only shows streamed text once this passes,
  // which mirrors the server holding the answer until the compliance agent clears it.
  const checks = runAdviceChecks(result.text, {
    requiresCitations: result.requiresCitations,
    citedIndexes: citedIndexesIn(result.text),
    retrievedIndexes: citations.map((c) => c.index),
    foreignIdentifiers: FOREIGN_IDENTIFIERS,
  });
  const attempt = drafts.length + 1;
  const passed = checks.every((c) => c.passed);
  drafts.push({
    attempt,
    passed,
    failedChecks: checks.filter((c) => !c.passed).map((c) => c.id),
    summary: passed
      ? 'Passed all eight advice checks.'
      : 'Failed the advice checks again, so the answer was withheld.',
  });
  await wait(360);
  yield { type: 'checked', checks, attempt };

  const text = passed
    ? result.text
    : 'This answer was withheld because it did not pass the advice checks. It has been logged for review.';
  for (const piece of chunk(text)) {
    await wait(22);
    yield { type: 'delta', text: piece };
  }

  const answer: TwinAnswer = {
    id: createAnswerId(),
    question: ctx.question,
    status: passed ? result.status : 'withheld',
    specialist: result.specialist,
    routeReason: result.routeReason,
    text,
    blocks: passed ? (result.blocks ?? []) : [],
    citations: passed ? citations : [],
    checks,
    drafts,
    library: { matched: citations.length, size: LIBRARY_SIZE, version: LIBRARY_VERSION },
    models: { ...MODELS },
    latencyMs: Date.now() - started,
    createdAt: new Date().toISOString(),
    shortcut: ctx.question.startsWith('/') ? ctx.question.split(/\s+/)[0] : undefined,
  };
  yield { type: 'done', answer };
  return answer;
}
