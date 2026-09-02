/** A serial port available on the system — from serialport's `SerialPort.list()`. */
export interface SerialPortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  vendorId?: string;
  productId?: string;
}
