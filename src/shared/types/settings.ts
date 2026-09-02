/**
 * Device settings pushed to the target over the BLE Settings characteristic
 * as FU1/FU2 writes — see
 * agentMemory/memories/ble-settings-write-protocol.md.
 */
export interface DeviceSettings {
  /** 1-5 */
  brightness: number;
  /** 0, 1, or 2 */
  mode: number;
  /** 0, 1, or 2 */
  shootingArea: number;
  /** max shot hits per heat, 1-5 */
  shotsHeat: number;
  /** time limit per heat in seconds, 10-50 */
  secondsHeat: number;
}
