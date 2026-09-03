import { useEffect, useRef } from 'react';
import type { DeviceMessage } from '../../../shared/types/device';

interface DeviceTerminalProps {
  messages: DeviceMessage[];
  onClear: () => void;
}

const KNOWN_PREFIXES = ['TAP', 'FUK', 'HCP'];

/** INFO's `IN<rowIndex>:...` master discovery reply — rowIndex varies
 * (IN0-IN9), so it can't be a fixed KNOWN_PREFIXES entry. See
 * agentMemory/memories/sip-time-sync-protocol.md. */
const MASTER_DISCOVERY_PREFIX = /^IN\d+(:|$)/;

const isKnownMessage = (text: string) =>
  KNOWN_PREFIXES.some((prefix) => text.startsWith(prefix)) || MASTER_DISCOVERY_PREFIX.test(text);

/** The device's own reply to a SIP command, or an INFO's `IN<row>` master
 * discovery reply — see agentMemory/memories/sip-time-sync-protocol.md.
 * Neither is a request/response pair parsed by this app the way FUK is (SIP
 * is fire-and-forget by design; IN<row> is recognize-and-highlight only), so
 * they're flagged here purely so they're visible in the terminal as replies
 * rather than looking like unmatched lines. */
const isDownArrowReply = (message: DeviceMessage) =>
  message.direction === 'in' &&
  (message.text.startsWith('SIP') || MASTER_DISCOVERY_PREFIX.test(message.text));

/** Outgoing writes (e.g. FU1/FU2 settings pushes) always get a red arrow;
 * a SIP or IN<row> reply gets its own green down arrow (still green — it's a
 * recognized reply — but pointing down to mark it as incoming, distinct from
 * the outgoing/known-match right arrow); other known incoming prefixes
 * (TAP/FUK/HCP) get a green right arrow; everything else is blank. */
const markerClassName = (message: DeviceMessage) => {
  if (message.direction === 'out') return 'ble-terminal-marker--out';
  if (isDownArrowReply(message)) return 'ble-terminal-marker--sip-in';
  if (isKnownMessage(message.text)) return 'ble-terminal-marker--match';
  return '';
};

const markerGlyph = (message: DeviceMessage) => {
  if (message.direction === 'out') return '-->';
  if (isDownArrowReply(message)) return '⬇  ';
  if (isKnownMessage(message.text)) return '-->';
  return '   ';
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
        {messages.map((message) => (
          <div key={message.id} className="ble-terminal-line">
            <span className={`ble-terminal-marker ${markerClassName(message)}`}>
              {markerGlyph(message)}
            </span>{' '}
            {message.text}
          </div>
        ))}
      </div>
    </div>
  );
};

export default DeviceTerminal;
