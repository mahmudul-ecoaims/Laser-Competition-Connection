/**
 * Buffers incoming bytes and splits them into complete messages.
 *
 * Framing is line-delimited text, but — confirmed by direct BLE capture,
 * see agentMemory/memories/ble-cr-only-line-endings.md — the device does
 * NOT reliably terminate every line with `\r\n`. Most lines end in `\r`
 * only; the matching `\n` shows up later, on its own, whenever it happens
 * to fall on a BLE notification packet boundary. So `\r` and `\n` are both
 * treated as line terminators here (whichever comes first), not just
 * `\n` — splitting on `\n` alone silently glues consecutive `\r`-only
 * lines together into one message until a stray `\n` eventually arrives.
 *
 * Both bleService and serialService feed raw bytes through an instance of
 * this class rather than parsing chunks themselves, which is what makes
 * the two transports produce identical message shapes.
 *
 * One instance per stream (each BLE characteristic, each serial port) so
 * partial lines from different streams never get mixed together.
 */
export class MessageFramer {
  private buffer = Buffer.alloc(0);

  /** Feed raw bytes in; returns zero or more complete message buffers. */
  push(chunk: Buffer): Buffer[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    const lines: Buffer[] = [];
    let delimiterIndex = this.buffer.findIndex((byte) => byte === 0x0a || byte === 0x0d); // '\n' or '\r'

    while (delimiterIndex !== -1) {
      const line = this.buffer.subarray(0, delimiterIndex);
      if (line.length > 0) {
        lines.push(Buffer.from(line));
      }

      this.buffer = this.buffer.subarray(delimiterIndex + 1);
      delimiterIndex = this.buffer.findIndex((byte) => byte === 0x0a || byte === 0x0d);
    }

    return lines;
  }

  /** Discard any partial message sitting in the buffer, e.g. on disconnect. */
  reset(): void {
    this.buffer = Buffer.alloc(0);
  }
}
