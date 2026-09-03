/** A serial port available on the system — from serialport's `SerialPort.list()`.
 * All fields but `path` are OS/driver-dependent and commonly undefined —
 * e.g. `pnpId` is mainly populated on Linux, `locationId` mainly on macOS. */
export interface SerialPortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  vendorId?: string;
  productId?: string;
  pnpId?: string;
  locationId?: string;
}
