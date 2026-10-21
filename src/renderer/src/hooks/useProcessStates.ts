import { useEffect, useState } from "react";
import type { InstanceProcessState } from "../../../shared/launcher";

export function useProcessStates(): {
  states: Record<string, InstanceProcessState>;
  loading: boolean;
  error: string;
} {
  const [states, setStates] = useState<Record<string, InstanceProcessState>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const updated = new Set<string>();
    const unsubscribe = window.api.onProcessState((state) => {
      updated.add(state.instanceId);
      if (active)
        setStates((current) => ({ ...current, [state.instanceId]: state }));
    });
    void window.api
      .getProcessStates()
      .then((snapshot) => {
        if (active)
          setStates((current) => ({
            ...Object.fromEntries(
              snapshot
                .filter((state) => !updated.has(state.instanceId))
                .map((state) => [state.instanceId, state]),
            ),
            ...current,
          }));
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error ? reason.message : "無法載入遊戲程序狀態",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  return { states, loading, error };
}
