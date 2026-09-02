import { useEffect, useState } from "react";
import "./styles/app.css";

const App = () => {
  return (
    <main className="app-shell">
      <section className="app-panel" aria-labelledby="app-title">
        <p className="app-kicker">Secure Electron + React starter</p>
        <h1 id="app-title">laser-competition</h1>
        <dl className="version-list">
          <div>
            <dt>Application version</dt>
          </div>
        </dl>
      </section>
    </main>
  );
};

export default App;
