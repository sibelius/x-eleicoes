import { simulate, type SimInput } from "./bubble-sim-core";

export type { SimInput };
export { simulate };

// Kept apart from bubble-sim-core: the worker imports only the core, never this file (a worker
// module that references its own worker URL sends Turbopack's build into a loop).

/** Simulates off the main thread when workers exist (else inline); returns a cancel function. */
export function simulateAsync(p: SimInput, done: (pos: Float64Array) => void): () => void {
  let worker: Worker | null = null;
  try {
    worker = new Worker(new URL("./bubble-sim.worker.ts", import.meta.url));
  } catch {
    worker = null;
  }
  if (!worker) {
    done(simulate(p));
    return () => {};
  }
  const w = worker;
  w.onmessage = (e: MessageEvent<Float64Array>) => {
    done(e.data);
    w.terminate();
  };
  w.onerror = () => {
    w.terminate();
    done(simulate(p));
  };
  w.postMessage(p);
  return () => w.terminate();
}
