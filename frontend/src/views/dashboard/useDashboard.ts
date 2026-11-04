import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { DashboardData } from "./components/WeeklyActivity";

const message = (e: unknown) =>
  e instanceof Error ? e.message : "Could not load overview.";

export function useDashboard(setError: (message: string) => void) {
  const [dashboard, setDashboard] = useState<DashboardData>();
  const [weeks, setWeeks] = useState(8);

  useEffect(() => {
    let stopped = false;
    const load = () =>
      api<DashboardData>(`/dashboard?weeks=${weeks}`)
        .then((v) => {
          if (!stopped) setDashboard(v);
        })
        .catch((e) => {
          if (!stopped) setError(message(e));
        });

    void load();
    const timer = setInterval(load, 5000);

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [weeks]);

  return { dashboard, weeks, setWeeks };
}
