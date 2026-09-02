// Reference snippet from the companion React Native app (settings
// screen/hook — not a standalone module, excerpted for its BLE write
// protocol). Documents how brightness/mode/secondsHeat/shootingArea/
// shotsHeat are pushed to the target device over the Settings
// characteristic (GLOBALS.SERVICE.SETTINGS, see index.ts) via
// BleHelper.writeCharacterics.
//
// Wire format (colon-delimited, ASCII):
//   FU1:01:0<brightness>:00:<mode>:0<shootingArea>
//   FU2:0<shotsHeat>:<secondsHeat>:<currentTime>
//
// - brightness: 1-5
// - mode: 0, 1, or 2
// - shootingArea: 0, 1, or 2
// - shotsHeat (max shot hits): 1-5
// - secondsHeat (time limit): 10-50
//
// The two writes are sent back-to-back inside a single timeout guard
// (10s). If neither value actually changed vs. current state, no BLE
// write happens at all (`unchanged` short-circuit) — settings pushes are
// diffed against the in-memory `brightness`/`mode`/`secondsHeat`/
// `shootingArea`/`shotsHeat` state, not re-sent unconditionally.
//
// The device echoes settings back on its own via a `FUK` message (see
// `_toObject.FUK` in BleHelper.js) — that's the confirmation path, this
// function only performs the write and does not itself listen for FUK.

async function deviceSettings({
  settingsType,
  value,
}: DeviceSettingsProps): Promise<boolean> {
  let deviceIdArg: string | null | undefined = deviceId;
  let brightnessArg: number = brightness;
  let modeArg: number = mode;
  let secondsHeatArg: number = secondsHeat;
  let shootingAreaArg: number = shootingArea;
  let shotsHeatArg: number = shotsHeat;

  const v = typeof value === 'string' ? Number(value) : value;

  switch (settingsType) {
    case 'brightness':
      brightnessArg = v;
      break;
    case 'mode':
      modeArg = v;
      break;
    case 'shootingArea':
      shootingAreaArg = v;
      break;
    case 'shotsHeat':
      shotsHeatArg = v;
      break;
    case 'secondsHeat':
      secondsHeatArg = v;
      break;
  }

  const unchanged =
    brightnessArg === brightness &&
    modeArg === mode &&
    secondsHeatArg === secondsHeat &&
    shootingAreaArg === shootingArea &&
    shotsHeatArg === shotsHeat;

  if (unchanged) return true;
  if (!deviceIdArg) return false;

  try {
    await animationHandlerTimeout(
      (async () => {
        await BleHelper.writeCharacterics(
          deviceIdArg,
          `FU1:01:0${brightnessArg}:00:${modeArg}:0${shootingAreaArg}`,
        );

        await BleHelper.writeCharacterics(
          deviceIdArg,
          `FU2:0${shotsHeatArg}:${secondsHeatArg}:${getCurrentTime()}`,
        );
      })(),
      10000,
      `Settings update timed out after ${10000 / 1000} seconds`,
    );
    return true;
  } catch (e: any) {
    __DEV__ && console.warn('[Settings] BLE write failed:', e?.message || e);
    return false;
  } finally {
    Store.dispatch('Settings/CHANGEABLE');
  }
}
