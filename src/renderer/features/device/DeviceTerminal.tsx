import { useEffect, useRef } from 'react';
import type { DeviceMessage } from '../../../shared/types/device';

interface DeviceTerminalProps {
  messages: DeviceMessage[];
  onClear: () => void;
}

const KNOWN_PREFIXES = ['TAP', 'FUK', 'HCP'];

const isKnownMessage = (text: string) => KNOWN_PREFIXES.some((prefix) => text.startsWith(prefix));

/** Outgoing writes (e.g. FU1/FU2 settings pushes) always get a red arrow;
 * known incoming prefixes get a green one; everything else is blank. */
const markerClassName = (message: DeviceMessage) => {
  if (message.direction === 'out') return 'ble-terminal-marker--out';
  if (isKnownMessage(message.text)) return 'ble-terminal-marker--match';
  return '';
};

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
          const showArrow = message.direction === 'out' || isKnownMessage(message.text);
          return (
            <div key={message.id} className="ble-terminal-line">
              <span className={`ble-terminal-marker ${markerClassName(message)}`}>
                {showArrow ? '-->' : '   '}
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
