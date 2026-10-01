import { useEffect, useState } from "react";
import { describeError, getAppInfo, type AppInfo } from "../lib/desktop";

export type DesktopConnection =
  | { state: "connecting" }
  | { state: "connected"; info: AppInfo }
  | { state: "error"; message: string };

export function useDesktopConnection() {
  const [connection, setConnection] = useState<DesktopConnection>({
    state: "connecting",
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setConnection({ state: "connecting" });

    getAppInfo()
      .then((info) => {
        if (active) setConnection({ state: "connected", info });
      })
      .catch((error: unknown) => {
        if (active) {
          setConnection({ state: "error", message: describeError(error) });
        }
      });

    return () => {
      active = false;
    };
  }, [attempt]);

  return {
    connection,
    retry: () => setAttempt((current) => current + 1),
  };
}
