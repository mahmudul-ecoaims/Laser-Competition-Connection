# Laser Competition Target

## BLE and Serial Communication Protocol

**Accepted working standard:** 03 September 2026  
**Document version:** 1.0  
**Implementation:** Electron desktop application

> Edit this Markdown file to remove or revise unwanted content. The PDF can
> then be regenerated from the approved text.

This document records the current hardware-working communication contract.
Preserve these wire formats, routes, terminators, and state rules unless a
later firmware change is deliberately verified.

### At a glance

| Concern | BLE | Serial / USB |
|---|---|---|
| Connection | GATT service with Command and Settings characteristics | One serial byte stream |
| Settings write | Two messages: FU1 then FU2 | One FUK-shaped line |
| Outgoing terminator | None | CRLF (`\r\n`) |
| Incoming framing | Split on CR or LF | Split on CR or LF; 200 ms idle flush |
| Settings read | Shared incoming FUK format | Shared incoming FUK format |

**Required state rule:** Every valid incoming FUK must remain visible in the
originating transport's terminal and immediately replace that transport's
Settings state. BLE and serial state stay independent.

## 1. Transport contracts

The same target can be connected over BLE and serial at the same time. Each
transport has independent connection, terminal, SIP mode, and Settings state.

### BLE identifiers

| GATT item | UUID | Purpose |
|---|---|---|
| Service | `0bd51666-e7cb-469b-8e4d-2742f1ba77cc` | Advertised target service |
| Command characteristic | `e7add780-b042-4876-aae1-11285535f821` | Raw device commands and normal incoming notifications |
| Settings characteristic | `e7add780-b042-4876-aae1-11285535f721` | FU1/FU2 settings, SIP and INFO writes; also subscribed when available |

| BLE operation | Route | Framing |
|---|---|---|
| Raw target command | Command characteristic | Plain ASCII; no line ending |
| Settings update | Settings characteristic | FU1 then FU2; no line ending |
| SIP / INFO | Settings characteristic | Plain ASCII; no line ending |
| Incoming messages | Usually Command notifications; accept either subscribed characteristic | Buffer fragments; split complete lines on CR or LF |

### Serial / USB contract

| Property | Current contract |
|---|---|
| Port model | One continuous byte stream through the `serialport` package |
| Baud rate | Application default: 115200; selectable alternatives: 9600, 19200, 38400, 57600 and 230400 |
| Outgoing framing | Append CRLF to every protocol command; drain after settings writes |
| Incoming framing | Split on CR or LF; after 200 ms with no new bytes, flush a final unterminated buffered line |
| Routing | One port only; there is no characteristic distinction |

**Framing rule:** Do not copy serial CRLF framing to BLE. BLE writes are
complete GATT messages. Do not send unterminated serial commands because the
device may continue waiting for the end of the line.

## 2. Settings write protocol

The settings model is shared, but the wire command is intentionally different
for BLE and serial. Settings controls are available only after the selected
transport confirms Standby mode (`S`).

### BLE: two GATT writes

```text
FU1:01:0<brightness>:00:<mode>:0<shootingArea>
FU2:0<shotsHeat>:<secondsHeat>:<HH:mm>

Example: FU1:01:03:00:0:02
         FU2:05:40:14:07
```

### Serial: one CRLF-terminated line

```text
FUK:01:0<brightness>:00:<mode>:0<shootingArea>:0<shotsHeat>:<secondsHeat>:0000000\r\n

Example: FUK:01:03:00:0:02:05:40:0000000\r\n
```

### Field contract

| Field | Allowed value | BLE encoding | Serial encoding |
|---|---|---|---|
| Target / lane | `01` fixed | FU1 field 1 | FUK field 1 |
| Brightness | 1-5 | `01`-`05` | `01`-`05` |
| Battery placeholder | `00` | FU1: `00` | FUK: `00` |
| Mode | `0` Competition; `1` Training; `2` OCR | Single digit | Single digit |
| Shooting area | 0-2 | `00`-`02` | `00`-`02` |
| Shots per heat | 1-5 | FU2: `01`-`05` | FUK: `01`-`05` |
| Heat seconds | 10, 20, 30, 40 or 50 | FU2: literal two digits | FUK: literal two digits |
| Time / timestamp | Transport-specific | Local `HH:mm` | Fixed `0000000` |

If a requested value already equals the latest device state, no write is sent.
Otherwise the app waits up to 10 seconds for the next valid FUK on that
transport and resolves with the device-reported values. Timeout or disconnect
is an error.

## 3. FUK read protocol and live state

BLE and serial use the same incoming FUK structure and parser. Only transport
delivery and framing differ.

```text
FUK:<targetNumber>:<brightness>:<battery>:<mode>:<shootingArea>:<shotsHeat>:<secondsHeat>:<timestamp>

Example: FUK:01:03:00:0:02:05:40:1234567
```

| Index | Wire field | Stored in Settings? | Meaning |
|---|---|---|---|
| 0 | `FUK` | No | Required case-sensitive prefix |
| 1 | `targetNumber` | No | Target / lane identifier |
| 2 | `brightness` | Yes | Brightness selection |
| 3 | `battery` | No | Remains in raw terminal text |
| 4 | `mode` | Yes | `0` Competition, `1` Training, `2` OCR |
| 5 | `shootingArea` | Yes | Selected shooting area |
| 6 | `shotsHeat` | Yes | Maximum shots per heat |
| 7 | `secondsHeat` | Yes | Heat time limit in seconds |
| 8 | `timestamp` | No | Remains in raw terminal text |

### Every valid FUK flow

1. BLE or serial bytes become one complete text line.
2. Publish the raw line to the originating transport's terminal.
3. Parse brightness, mode, shooting area, shots and seconds.
4. Replace that transport service's `currentSettings`.
5. Push `device:settings-changed` and update only the matching BLE or serial Settings state.
6. Resolve a pending settings write if one exists for that transport.

The canonical FUK includes the timestamp. The app requires fields through
`secondsHeat` and finite numeric values for the five stored settings. It ignores
target, battery and timestamp, tolerates an absent or extra timestamp, and does
not range-check numeric values.

There is no dedicated settings-read request on connect. Defaults remain visible
until the first valid FUK arrives. FUK has no correlation ID, so the next valid
FUK on a transport also confirms any pending write on that transport.

## 4. Shared commands and replies

SIP and INFO use the same command text on both transports. Only routing and
line termination differ.

### SIP time synchronization

```text
SIP:<lane>:<S|L>:hhmmsscc
Example: SIP:01:L:08263283
```

- Lane is fixed to `01`.
- `S` or `L` is the sync kind. The echoed kind confirms Standby/Live state.
- `hhmmsscc` is local hours, minutes, seconds and centiseconds: eight digits.
- Observed reply: `SIP:01:L:08263283:11714`. The extra field is not interpreted.

### INFO master discovery

```text
INFO<lane>
Example request: INFO01
Example replies: IN0:95:88:91:70
                 IN1:100:93:-1:84
```

- `IN<rowIndex>:<value1>:<value2>:...` carries one discovery row; documented row indexes are 0-9.
- Invalid values normalize to `-1`. The desktop recognizes and highlights rows but does not store a discovery table.

| Command | BLE | Serial | Reply handling |
|---|---|---|---|
| SIP | Settings characteristic; no terminator | Single port; append CRLF | Renderer reads echoed S/L kind |
| INFO | Settings characteristic; no terminator | Single port; append CRLF | IN rows recognized and highlighted |
| Raw target command | Command characteristic; no terminator | Single port; caller-provided bytes | Terminal receives device output |

### Recognized incoming message families

| Prefix | Desktop behavior |
|---|---|
| FUK | Terminal, parsed Settings state and pending-write confirmation |
| SIP | Terminal and confirmed S/L UI mode |
| `IN<number>` | Terminal recognition/highlighting; parser available |
| TAP | Known incoming shot line; terminal display |
| HCP | Known incoming heat summary line; terminal display |

### Implementation checklist

1. Keep BLE and serial connections, terminals, SIP modes and Settings states independent.
2. Use exact BLE characteristic routing; never add serial endings to BLE.
3. Append CRLF to serial commands; split incoming data on CR or LF.
4. Send every FUK to the terminal and originating transport's Settings state.
5. Gate settings on confirmed Standby and trust device-reported FUK values.
6. Treat timeout or disconnect as unconfirmed; never apply only the requested value.
