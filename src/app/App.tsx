import { Sidebar } from "../components/Sidebar";
import { BackendStatus } from "../components/BackendStatus";
import { EmptyQueue } from "../features/transfers/EmptyQueue";
import { useDesktopConnection } from "./useDesktopConnection";

export default function App() {
  const { connection, retry } = useDesktopConnection();

  return (
    <div className="app-shell">
      <Sidebar connection={connection} />

      <main className="workspace">
        <header className="workspace__header">
          <div>
            <h1>All torrents</h1>
            <p>Local transfer queue</p>
          </div>
          <BackendStatus connection={connection} onRetry={retry} />
        </header>

        <EmptyQueue />
      </main>
    </div>
  );
}
