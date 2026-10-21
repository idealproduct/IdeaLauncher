import { useEffect, useState } from "react";
import type { DownloadTask } from "../../../shared/content";

export function useDownloads(): { tasks: DownloadTask[]; error: string } {
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true,
      updated = false;
    const unsubscribe = window.api.onDownloadsChanged((value) => {
      updated = true;
      if (active) setTasks(value);
    });
    void window.api
      .getDownloads()
      .then((value) => {
        if (active && !updated) setTasks(value);
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error ? reason.message : "無法讀取下載佇列",
          );
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  return { tasks, error };
}
