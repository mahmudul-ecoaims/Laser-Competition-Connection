import { useEffect, useState } from "react";
import "./styles/app.css";

const App = () => {
  const [appVersion, setAppVersion] = useState<string>("Loading...");

  useEffect(() => {
    let isMounted = true;

    window.electronAPI
      .getAppVersion()
      .then((version) => {
        if (isMounted) {
          setAppVersion(version);
        }
      })
      .catch(() => {
        if (isMounted) {
          setAppVersion("Unavailable");
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main className="root">
      <section className="app-panel" aria-labelledby="app-title">
        <p className="app-kicker">Secure Electron + React starter</p>
        <h1 id="app-title">laser-competition</h1>
        <dl className="version-list">
          <div>
            <dt>Application version</dt>
            <dd>{appVersion}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
};

export default App;
