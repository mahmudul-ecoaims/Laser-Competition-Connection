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
  // BLE and serial connect/read/write independently and at the same time —
  // see agentMemory/memories/device-transport-abstraction.md. `screen` only
  // picks which one is currently displayed; the other keeps running in the
  // background and its messages keep accumulating until it's shown again.
  const status = screen === 'ble' ? device.bleStatus : screen === 'serial' ? device.serialStatus : null;
  const isConnected = status?.status === 'connected';
  const messages = screen === 'ble' ? device.bleMessages : device.serialMessages;
  // BLE shows Settings as soon as it's connected. Serial only shows it once
  // the device has confirmed standby mode (serialSipMode === 'S') — unlike
  // BLE, there's no evidence yet a serial-connected device accepts a
  // settings write outside standby, so the panel stays hidden until that's
  // confirmed via the SIP reply (see agentMemory/memories/sip-time-sync-protocol.md).
  const showSettings =
    isConnected && (device.mode === 'ble' || (device.mode === 'serial' && device.serialSipMode === 'S'));

  const selectMode = (mode: DeviceMode) => {
    device.setMode(mode);
    setScreen(mode);
  };

  const goBack = () => {
    setScreen('choice');
  };

  return (
    <main className={`app-shell${screen !== 'choice' ? ' app-shell--with-back' : ''}`}>
      <section
        className={`app-workspace${isConnected ? ' app-workspace--split' : ''}`}
        aria-labelledby="app-title"
      >
        <header className={`app-header${screen !== 'choice' ? ' app-header--with-back' : ''}`}>
          {screen !== 'choice' && (
            <button type="button" className="back-button page-back-button" onClick={goBack} aria-label="Back">
              <span className="back-button-icon" aria-hidden="true" />
            </button>
          )}
          <h1 id="app-title">Laser Competition</h1>
          {screen !== 'choice' && <span className="app-header-balance" aria-hidden="true" />}
        </header>

        {screen === 'choice' ? (
          <ConnectionChoiceScreen
            onSelect={selectMode}
            bleStatus={device.bleStatus.status}
            serialStatus={device.serialStatus.status}
          />
        ) : (
          <div className="device-screen">
            <div className={`app-content${isConnected ? ' app-content--split' : ''}`}>
              <div className="app-content-left">
                <DevicePanel device={device} />
                {showSettings && <DeviceSettingsPanel device={device} transport={device.mode} />}
              </div>
              {isConnected && (
                <DeviceTerminal messages={messages} onClear={() => device.clearMessages(screen)} />
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
};

export default App;
