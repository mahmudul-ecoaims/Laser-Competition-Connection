import { useState } from 'react';
import './styles/app.css';
import ConnectionChoiceScreen from './features/device/ConnectionChoiceScreen';
import DevicePanel from './features/device/DevicePanel';
import DeviceSettingsPanel from './features/device/DeviceSettingsPanel';
import DeviceTerminal from './features/device/DeviceTerminal';
import { useDevice, type DeviceMode } from './features/device/useDevice';

type Screen = 'choice' | DeviceMode;

const App = () => {
  const [screen, setScreen] = useState<Screen>('choice');
  const device = useDevice();
  const isConnected = device.status.status === 'connected';

  const selectMode = (mode: DeviceMode) => {
    device.setMode(mode);
    setScreen(mode);
  };

  const goBack = () => {
    setScreen('choice');
  };

  return (
    <main className={`app-shell${screen !== 'choice' ? ' app-shell--with-back' : ''}`}>
      {screen !== 'choice' && (
        <button type="button" className="back-button page-back-button" onClick={goBack} aria-label="Back">
          <span className="back-button-icon" aria-hidden="true" />
        </button>
      )}
      <section
        className={`app-workspace${isConnected ? ' app-workspace--split' : ''}`}
        aria-labelledby="app-title"
      >
        <header className="app-header">
          <h1 id="app-title">Laser Competition</h1>
        </header>

        {screen === 'choice' ? (
          <ConnectionChoiceScreen onSelect={selectMode} />
        ) : (
          <div className="device-screen">
            <div className={`app-content${isConnected ? ' app-content--split' : ''}`}>
              <div className="app-content-left">
                <DevicePanel device={device} />
                {isConnected && device.mode === 'ble' && <DeviceSettingsPanel device={device} />}
              </div>
              {isConnected && <DeviceTerminal messages={device.messages} onClear={device.clearMessages} />}
            </div>
          </div>
        )}
      </section>
    </main>
  );
};

export default App;
