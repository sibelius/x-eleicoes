import { simulate, type SimInput } from "./bubble-sim-core";

// Runs one bubble layout and posts the positions back (see simulateAsync).
self.onmessage = (e: MessageEvent<SimInput>) => {
  const out = simulate(e.data);
  (self as unknown as Worker).postMessage(out, [out.buffer]);
};
