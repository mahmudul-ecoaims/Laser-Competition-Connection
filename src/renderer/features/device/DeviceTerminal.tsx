import { useEffect, useRef } from 'react';
import type { DeviceMessage } from '../../../shared/types/device';

interface DeviceTerminalProps {
  messages: DeviceMessage[];
  onClear: () => void;
}

const KNOWN_PREFIXES = ['TAP', 'FUK', 'HCP'];

const isKnownMessage = (text: string) => KNOWN_PREFIXES.some((prefix) => text.startsWith(prefix));

const DeviceTerminal = ({ messages, onClear }: DeviceTerminalProps) => {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const log = logRef.current;
    if (log) {
      log.scrollTop = log.scrollHeight;
    }
  }, [messages.length]);

  return (
    <div className="ble-terminal">
      <div className="ble-terminal-header">
        <h2>Incoming messages</h2>
        <button type="button" onClick={onClear} disabled={messages.length === 0}>
          Clear
        </button>
      </div>

      <div className="ble-terminal-log" ref={logRef}>
        {messages.length === 0 && <p className="ble-terminal-empty">Waiting for data…</p>}
        {messages.map((message) => {
          const isMatch = isKnownMessage(message.text);
          return (
            <div key={message.id} className="ble-terminal-line">
              <span className={`ble-terminal-marker${isMatch ? ' ble-terminal-marker--match' : ''}`}>
                {isMatch ? '-->' : '   '}
              </span>{' '}
              {message.text}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DeviceTerminal;
