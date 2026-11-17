import { useEffect, useRef } from "react";

import { registerPushDevice } from "@/lib/push";

/**
 * Register this install once it can be registered.
 *
 * The token does not exist at first paint — Firebase issues it asynchronously — and the
 * person may not be signed in yet either. So the attempt is made at launch and again when
 * the window regains focus, and it stops the moment the server has the row.
 */
export function usePushRegistration(): void {
  const registered = useRef(false);

  useEffect(() => {
    if (registered.current) return;
    let disposed = false;

    const attempt = () => {
      void registerPushDevice()
        .then((result) => {
          if (result === "registered") registered.current = true;
        })
        .catch((error: unknown) => {
          // A failed registration must not touch the reading surface; the next focus retries.
          console.warn("push registration failed", error);
        });
    };

    attempt();
    const onFocus = () => {
      if (!disposed && !registered.current) attempt();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      disposed = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);
}
