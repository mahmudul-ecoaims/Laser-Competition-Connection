/**
 * Not confirmed with hardware yet — 115200 is just the most common default
 * for this class of device. Update once the real baud rate is known (see
 * agentMemory/memories/message-framing-unconfirmed.md).
 */
export const DEFAULT_BAUD_RATE = 115200;

export const COMMON_BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400] as const;
