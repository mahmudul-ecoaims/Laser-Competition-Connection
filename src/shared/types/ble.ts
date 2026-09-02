/** A BLE scan result — advertising info only, not yet connected. */
export interface BleDeviceInfo {
  id: string;
  name: string | null;
  rssi: number;
}
