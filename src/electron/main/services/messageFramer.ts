/**
 * Buffers incoming bytes and splits them into complete messages.
 *
 * Framing is NOT confirmed with the hardware yet (see
 * agentMemory/memories/message-framing-unconfirmed.md) — this assumes
 * newline-delimited text lines (`\n`, with an optional trailing `\r`
 * stripped), the most common convention for this kind of device protocol.
 * If the real framing turns out to be different (fixed length, a different
 * delimiter, binary length-prefixed, ...), this is the only file that needs
 * to change — both bleService and serialService feed raw bytes through an
 * instance of this class rather than parsing chunks themselves, which is
 * what makes the two transports produce identical message shapes.
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
    let newlineIndex = this.buffer.indexOf(0x0a); // '\n'

    while (newlineIndex !== -1) {
      let line = this.buffer.subarray(0, newlineIndex);
      if (line.length > 0 && line[line.length - 1] === 0x0d) {
        // trailing '\r'
        line = line.subarray(0, line.length - 1);
      }
      if (line.length > 0) {
        lines.push(Buffer.from(line));
      }

      this.buffer = this.buffer.subarray(newlineIndex + 1);
      newlineIndex = this.buffer.indexOf(0x0a);
    }

    return lines;
  }

  /** Discard any partial message sitting in the buffer, e.g. on disconnect. */
  reset(): void {
    this.buffer = Buffer.alloc(0);
  }
}
