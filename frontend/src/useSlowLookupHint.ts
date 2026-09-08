import { useEffect, useState } from "react";

/** True once a lookup has been running for `delayMs`; resets when it stops. */
export default function useSlowLookupHint(running: boolean, delayMs = 10_000) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!running) {
      setSlow(false);
      return;
    }
    const timer = window.setTimeout(() => setSlow(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [running, delayMs]);
  return slow;
}
