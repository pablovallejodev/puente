/**
 * Self-check for EngineSlot lifecycle: reset clears the attempt budget, and
 * switching models disposes the previous engine before creating the next.
 */
import assert from "node:assert/strict";

import { EngineSlot } from "../src/lib/engines/slot";

type FakeEngine = { id: string; dispose(): void };

function makeSlot(disposed: string[], creates: { n: number }) {
  return new EngineSlot<FakeEngine>({
    maxAttempts: 2,
    create: async (modelId) => {
      creates.n += 1;
      return {
        id: modelId,
        dispose: () => {
          disposed.push(modelId);
        },
      };
    },
    errors: {
      noSelection: () => new Error("no selection"),
      exhausted: (n, id) => new Error(`exhausted ${n} ${id}`),
      loadFailed: (err) => (err instanceof Error ? err : new Error(String(err))),
    },
  });
}

async function testResetClearsAttempts(): Promise<void> {
  const disposed: string[] = [];
  const creates = { n: 0 };
  const slot = makeSlot(disposed, creates);

  // Burn attempts across external resets (applySelection → remount).
  await slot.load("a");
  assert.equal(slot.attemptsUsed, 1);
  slot.reset();
  assert.equal(slot.attemptsUsed, 0);
  assert.deepEqual(disposed, ["a"]);

  await slot.load("a");
  assert.equal(slot.attemptsUsed, 1);
  slot.reset();
  assert.equal(slot.attemptsUsed, 0);

  // Third load must still succeed — before the fix, attempts stayed at 2 and
  // load threw exhausted without trying.
  const engine = await slot.load("a");
  assert.equal(engine.id, "a");
  assert.equal(creates.n, 3);
}

async function testSwitchDisposesPrevious(): Promise<void> {
  const disposed: string[] = [];
  const slot = makeSlot(disposed, { n: 0 });

  await slot.load("whisper");
  await slot.load("sherpa");
  assert.deepEqual(disposed, ["whisper"]);
  assert.equal(slot.modelId, "sherpa");
  assert.equal(slot.attemptsUsed, 1);
}

async function main(): Promise<void> {
  await testResetClearsAttempts();
  await testSwitchDisposesPrevious();
  console.log("check-engine-slot: ok");
}

void main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
