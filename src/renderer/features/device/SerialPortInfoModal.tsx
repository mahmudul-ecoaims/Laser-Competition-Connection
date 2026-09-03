import { useEffect } from 'react';
import type { SerialPortInfo } from '../../../shared/types/serial';

interface SerialPortInfoModalProps {
  port: SerialPortInfo;
  onClose: () => void;
}

/** Every field `SerialPortInfo` can carry, in display order — see
 * agentMemory/memories/serial-port-info-fields.md for what each means and
 * how reliably it's populated. */
const FIELDS: Array<{ key: keyof SerialPortInfo; label: string }> = [
  { key: 'path', label: 'Path' },
  { key: 'manufacturer', label: 'Manufacturer' },
  { key: 'serialNumber', label: 'Serial number' },
  { key: 'vendorId', label: 'Vendor ID' },
  { key: 'productId', label: 'Product ID' },
  { key: 'pnpId', label: 'PNP ID' },
  { key: 'locationId', label: 'Location ID' },
];

/** Closes on an outside click (the overlay) or the Cancel button — never on
 * a click inside the modal card itself (stopPropagation there). Escape is
 * wired too as a standard, low-cost modal affordance. */
const SerialPortInfoModal = ({ port, onClose }: SerialPortInfoModalProps) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="serial-port-info-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="serial-port-info-title">Port info</h3>

        <dl className="modal-field-list">
          {FIELDS.map(({ key, label }) => (
            <div key={key} className="modal-field-list-row">
              <dt>{label}</dt>
              <dd>{port[key] ?? '—'}</dd>
            </div>
          ))}
        </dl>

        <div className="ble-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default SerialPortInfoModal;
