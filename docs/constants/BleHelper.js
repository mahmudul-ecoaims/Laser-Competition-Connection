import BleManager from "react-native-ble-manager";
import { bytesToString, stringToBytes } from "convert-string";
import {
  Alert,
  PermissionsAndroid,
  Platform,
  NativeEventEmitter,
  NativeModules,
  Linking,
} from "react-native";
import { Store } from "../api";
import { GLOBALS } from "../constants";
import { store } from "../store";

const _ = require("lodash");
const { v4: UUIDv4 } = require("uuid");

let scanInterval = null;
let rssiInterval = null;

// New-style event subscriptions (must be removed on cleanup)
let stopScanSub = null;
let updateSub = null;
let disconnectSub = null;

// init/permission guards
let bleInitialized = false;
let permissionsRequested = false;

// --- Pairing / connect / scan guards & helpers ---
let pairingInProgress = false; // true while OS pairing UI may be up / secured ops running
let connectInProgress = false; // serialize connects
let recoverySuppressUntil = 0; // timestamp (ms) to ignore disconnect recovery
let isScanning = false; // true while our polling loop is active

const now = () => Date.now();
const delay = (ms) => new Promise((res) => setTimeout(res, ms));
const CONNECT_TIMEOUT_MS = 15000;
const suppressRecovery = (ms) => {
  recoverySuppressUntil = now() + ms;
};
const isAndroid = GLOBALS.DEVICE.IS_ANDROID;

const isIOSOn = (s) => IOS_ON_STATES.has(norm(s));
// --- iOS BT state normalization helpers ---
const IOS_ON_STATES = new Set(["on", "poweredon"]);
const IOS_OFF_STATES = new Set(["off", "poweredoff"]);
const IOS_NEUTRAL_STATES = new Set(["unknown", "resetting"]);
const norm = (s) => (s ? String(s).toLowerCase() : null);
const isIOSBluetoothOn = (s) => IOS_ON_STATES.has(norm(s));
const isIOSBluetoothOff = (s) => IOS_OFF_STATES.has(norm(s));
const isIOSNeutral = (s) => IOS_NEUTRAL_STATES.has(norm(s));

const isConnected = () => {
  try {
    return !!store.getState().device?.connected;
  } catch {
    return false;
  }
};

/* --------------------
 Packet parsing
-------------------- */
const _toObject = {
  TAP: (data) => {
    const yStartEnd = _.map(_.split(data[9], "."), _.toInteger);
    const xStartEnd = _.map(_.split(data[10], "."), _.toInteger);

    return {
      id: UUIDv4(),
      rangeNumber: parseInt(data[1]),
      stationNumber: parseInt(data[2]),
      shotNumber: parseInt(data[3]),
      heatNumber: parseInt(data[4]),
      heatShotHit: parseInt(data[5]),
      heatShotNumber: parseInt(data[6]),
      hit: !!parseInt(data[7]),
      timeFromStart: parseInt(parseFloat(data[8]) * 100),
      yStart: yStartEnd[0],
      yEnd: yStartEnd[1],
      xStart: xStartEnd[0],
      xEnd: xStartEnd[1],
      shotValue: parseInt(data[11]),
    };
  },
  FUK: (data) => ({
    targetNumber: parseInt(data[1]),
    brightness: parseInt(data[2]),
    battery: parseInt(data[3]),
    mode: parseInt(data[4]),
    shootingArea: parseInt(data[5]),
    shotsHeat: parseInt(data[6]),
    secondsHeat: parseInt(data[7]),
    timestamp: parseInt(data[8]),
  }),
  HCP: (data) => ({
    rangeNumber: parseInt(data[1]),
    targetNumber: parseInt(data[2]),
    heatNumber: parseInt(data[3]),
    heatEndedType: data[4],
    numberOfShots: parseInt(data[5]),
    numberOfHits: parseInt(data[6]),
    numberOfMisses: parseInt(data[7]),
    heatDuration: parseInt(parseFloat(data[8]) * 100),
    timestamp: parseInt(data[9]),
  }),
};

const dispatchers = {
  TAP: (data) => Store.dispatch("Stream/SHOT_DETECTED", _toObject.TAP(data)),
  FUK: (data) =>
    Store.dispatch("Settings/TARGET_SETTINGS", _toObject.FUK(data)),
  HCP: (data) => Store.dispatch("Stream/END_SESSION", _toObject.HCP(data)),
};

let type;
let dataBuf;

const _dispatchEvent = (tp, raw) => {
  let packet = _.split(raw, ":");
  packet = _.reject(packet, _.isEmpty);
  packet = _.map(packet, _.trim);
  dispatchers[tp](packet);
};

const _packetParsing = (decoded) => {
  let packet = _.split(decoded, ":");
  packet = _.reject(packet, _.isEmpty);
  packet = _.map(packet, _.trim);

  const packetType = packet[0];

  switch (packetType) {
    case "TAP":
      type = packetType;
      dataBuf = decoded;
      break;
    case "FUK":
      type = packetType;
      dataBuf = decoded;
      break;
    case "HCP":
      type = packetType;
      dataBuf = decoded;
      break;
    default:
      if (type) {
        dataBuf = dataBuf + decoded;

        _dispatchEvent(type, dataBuf);
        type = undefined;
        dataBuf = undefined;

        // }
      }
  }
};

const _onBleValue = (event) => {
  const value = bytesToString(event.value);
  __DEV__ && console.log("->", value);
  _packetParsing(value);
  // Store.dispatch('Stream/ADD', value);
};

/* --------------------
 BLE lifecycle helpers
-------------------- */
const handleStopScan = async () => {
  __DEV__ && console.log("Scan is stopped");
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
  }
  isScanning = false;
};

const rssiRead = async (deviceId) => {
  if (!deviceId) {
    __DEV__ && console.log("rssiRead: no deviceId");
    return false;
  }
  try {
    const rssi = await BleManager.readRSSI(deviceId);
    Store.dispatch("Settings/SET_RSSI", rssi);
    return true;
  } catch (e) {
    __DEV__ &&
      console.log("[NORMAL WHILE RECONNECTING] RSSI error", e?.message);
    Store.dispatch("Settings/SET_RSSI", null);
  }
  return false;
};

const handleDisconnect = () => {
  Store.dispatch("Settings/SET_RSSI", null);

  const device = store.getState().device;
  Store.dispatch("Device/SET", { ...device, connected: false });

  if (rssiInterval) {
    clearInterval(rssiInterval);
    rssiInterval = null;
  }

  const deviceId = device?.id || null;
  if (!deviceId) return;

  if (pairingInProgress || connectInProgress || now() < recoverySuppressUntil) {
    __DEV__ &&
      console.log("[disconnect] recovery suppressed (pair/conn/cooldown)");
    return;
  }

  // try to recover connection twice before manual disconnect
  setTimeout(async () => {
    if (pairingInProgress || connectInProgress || now() < recoverySuppressUntil)
      return;

    const deviceState = store.getState().device;
    if (await rssiRead(deviceState.id)) return; // still alive

    try {
      if (deviceState?.id === deviceId) {
        Store.dispatch("Settings/SET_RSSI", null);
        if ((await reconnectToDevice(deviceState)) === true) return;
      }
    } catch (e) {
      __DEV__ && console.log(e);
    }

    setTimeout(async () => {
      if (
        pairingInProgress ||
        connectInProgress ||
        now() < recoverySuppressUntil
      )
        return;

      const deviceState2 = store.getState().device;
      if (await rssiRead(deviceState2.id)) return;

      try {
        if (deviceState2?.id === deviceId) {
          Store.dispatch("Settings/SET_RSSI", null);
          if ((await reconnectToDevice(deviceState2)) === true) return;
        }
      } catch (e) {
        __DEV__ && console.log(e);
      }

      // failed → manual disconnect flow
      await handleManualDisconnect(device);
    }, 12000);
  }, 5000);
};

/* --------------------
 Android permission helpers (NO RECURSION)
-------------------- */
const androidInitOld = async () => {
  try {
    if (!GLOBALS.DEVICE.IS_LOCATION_REQUIRED) return true;

    const has = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    if (!has) {
      if (permissionsRequested) {
        Alert.alert(
          "Permission required",
          "Location permission is needed to scan for Bluetooth devices. Please enable it in Settings and try again.",
        );
        return false;
      }
      permissionsRequested = true;

      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert(
          "Permission required",
          "Location permission was denied. Enable it in Settings to continue.",
        );
        return false;
      }
    }
    if (Platform.OS === "android") {
      const { default: LocationEnabler } =
        await import("react-native-android-location-enabler");
      try {
        await LocationEnabler.promptForEnableLocationIfNeeded({
          interval: 10000,
          fastInterval: 5000,
        });
      } catch {
        // user declined; proceed without recursion
      }
    }
    return true;
  } catch (error) {
    __DEV__ && console.log("androidInitOld error:", error?.message || error);
    return false;
  }
};

const androidInitNew = async () => {
  try {
    // Always-required on Android 12+ (API 31+)
    const REQUIRED = [
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    ];

    // Optional location only if your config says it's needed (API <= 30 typically)
    const OPTIONAL = GLOBALS.DEVICE.IS_LOCATION_REQUIRED
      ? [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]
      : [];

    const toCheck = [...REQUIRED, ...OPTIONAL];

    const need = [];
    for (const p of toCheck) {
      const has = await PermissionsAndroid.check(p);
      if (!has) need.push(p);
    }

    if (need.length) {
      if (permissionsRequested) {
        Alert.alert(
          "Bluetooth permissions required",
          "Please grant Bluetooth permissions in Settings to continue.",
        );
        return false;
      }
      permissionsRequested = true;

      const res = await PermissionsAndroid.requestMultiple(need);
      const requiredOk = REQUIRED.every(
        (p) => res[p] === PermissionsAndroid.RESULTS.GRANTED,
      );

      if (!requiredOk) {
        Alert.alert(
          "Bluetooth permissions required",
          "Bluetooth permissions were denied. Please enable them in Settings.",
        );
        return false;
      }
      // OPTIONAL location may be denied if not required; that’s fine.
    }

    if (GLOBALS.DEVICE.IS_LOCATION_REQUIRED) {
      if (Platform.OS === "android") {
        const { default: LocationEnabler } =
          await import("react-native-android-location-enabler");
        try {
          await LocationEnabler.promptForEnableLocationIfNeeded({
            interval: 10000,
            fastInterval: 5000,
          });
        } catch {
          // user declined; proceed without recursion
        }
      }
    }

    return true;
  } catch (error) {
    __DEV__ && console.log("androidInitNew error:", error?.message || error);
    return false;
  }
};

/* --------------------
 Public API
-------------------- */
const SCAN_SECONDS = 5;

// Single cross-platform emitter backed by the native module
const BleManagerModule = NativeModules.BleManager;
const bleEmitter = new NativeEventEmitter(BleManagerModule);

const initBleManager = async () => {
  if (bleInitialized) return true; // guard against double init

  try {
    await BleManager.start({ showAlert: false });
  } catch (e) {
    __DEV__ && console.log("BleManager.start error:", e?.message);
  }

  // Remove previous subs if re-inited
  stopScanSub?.remove?.();
  updateSub?.remove?.();
  disconnectSub?.remove?.();

  // Event APIs
  stopScanSub = BleManager.onStopScan(handleStopScan);
  updateSub = BleManager.onDidUpdateValueForCharacteristic(_onBleValue);
  disconnectSub = BleManager.onDisconnectPeripheral(handleDisconnect);

  // Android permission & enabling flows
  if (GLOBALS.DEVICE.IS_ANDROID) {
    try {
      if (Platform.Version >= 31) {
        const ok = await androidInitNew();
        if (!ok) return false; // ⬅️ bail if user denied
      } else {
        const ok = await androidInitOld();
        if (!ok) return false; // ⬅️ bail if user denied / location off
      }
      try {
        await BleManager.enableBluetooth();
      } catch (e) {
        __DEV__ &&
          console.log("enableBluetooth canceled or failed:", e?.message);
      }
    } catch (e) {
      __DEV__ && console.log("Android init error:", e?.message);
      return false; // ⬅️ bail on unexpected init failure
    }
  }

  try {
    await BleManager.checkState(); // trigger native state check
  } catch (e) {
    __DEV__ && console.log("checkState error:", e?.message);
  }

  bleInitialized = true;
  return true;
};

// Minimal helper to ensure Bluetooth is ON:
// - Android: prompt via enableBluetooth()
// - iOS: only block if we DEFINITELY see 'off/poweredOff'. Otherwise proceed.
async function ensureBluetoothOn() {
  try {
    if (Platform.OS === "android") {
      await BleManager.enableBluetooth();
      return true;
    }

    // iOS: make sure the manager is started (in case this runs before init)
    if (!bleInitialized) {
      try {
        await BleManager.start({ showAlert: false });
      } catch {}
    }

    // Prefer direct getState
    let s = null;
    try {
      __DEV__ && console.log("Going for Bluetooth State Checking", s);
      if (typeof BleManager.getState === "function") {
        __DEV__ && console.log(" It has come inside the function", s);
        s = await BleManager.getState(); // 'on' | 'off' | 'unauthorized' | 'unsupported' | 'resetting' | 'unknown'
        __DEV__ && console.log("[ensureBluetoothOn] initial iOS state:", s);
        if (isIOSBluetoothOn(s)) return true;
        if (isIOSBluetoothOff(s)) {
          // Only here we actually prompt
          Alert.alert(
            "Bluetooth is Off",
            "Please enable Bluetooth to scan for nearby devices.",
            [
              {
                text: "Open Settings",
                onPress: () => Linking.openSettings?.(),
              },
              { text: "Cancel", style: "cancel" },
            ],
          );
          return false;
        }
        // If neutral/unknown → fall through to wait for an update
      }
    } catch {}

    // Fallback: wait for one state update after checkState()
    const state = await new Promise((resolve) => {
      let settled = false;

      const sub = bleEmitter.addListener(
        "BleManagerDidUpdateState",
        ({ state }) => {
          if (settled) return;
          settled = true;
          try {
            sub.remove();
          } catch {}
          resolve(state);
        },
      );

      BleManager.checkState?.();

      setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          sub.remove();
        } catch {}
        resolve(null); // timed out
      }, 4000);
    });

    __DEV__ && console.log("[ensureBluetoothOn] event iOS state:", state);

    if (isIOSBluetoothOff(state)) {
      Alert.alert(
        "Bluetooth is Off",
        "Please enable Bluetooth to scan for nearby devices.",
        [
          { text: "Open Settings", onPress: () => Linking.openSettings?.() },
          { text: "Cancel", style: "cancel" },
        ],
      );
      return false;
    }

    // For 'on' or neutral/unknown → proceed (fail-open to avoid false prompts)
    return true;
  } catch (e) {
    __DEV__ && console.log("ensureBluetoothOn error:", e?.message);
    // Fail-open on iOS to avoid false negatives
    return Platform.OS === "ios";
  }
}

const scanDevices = async (setListFn /* optional: (devices) => void */) => {
  __DEV__ && console.log("BLE Scan Device (requested)");

  // If we’re already connected, don’t scan again.
  if (isConnected()) {
    __DEV__ && console.log("scanDevices skipped: already connected");
    return false;
  }
  const btReady = await ensureBluetoothOn();
  if (!btReady) {
    __DEV__ &&
      console.log("scanDevices aborted: Bluetooth is off or user cancelled");
    return false;
  }
  // Don’t start a second scanner if one is running.
  if (isScanning || scanInterval) {
    __DEV__ && console.log("scanDevices skipped: scanner already running");
    return true;
  }

  // Extra guard for Android 12+ — do not scan without required perms
  if (GLOBALS.DEVICE.IS_ANDROID && Platform.Version >= 31) {
    try {
      const hasScan = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      );
      const hasConnect = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      );
      if (!hasScan || !hasConnect) {
        __DEV__ &&
          console.log("scanDevices: missing BLUETOOTH_* permission(s)");
        return false;
      }
    } catch (e) {
      __DEV__ && console.log("scanDevices perm check error:", e?.message);
      return false;
    }
  }

  // Make sure no stale scan is active
  try {
    await BleManager.stopScan();
  } catch {
    // ignore
  }

  // Android keeps a discovered-peripherals cache; clear it before a fresh scan
  // so powered-off devices don't stay in the list.
  if (Platform.OS === "android") {
    try {
      const stale = await BleManager.getDiscoveredPeripherals();
      await Promise.all(
        (stale || []).map((p) =>
          BleManager.removePeripheral(p?.id).catch(() => null),
        ),
      );
    } catch (e) {
      __DEV__ && console.log("clear discovered cache error", e?.message);
    }
  }

  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
  }

  try {
    isScanning = true;
    await BleManager.scan({
      serviceUUIDs: [GLOBALS.SERVICE.ID], // or [] to scan all
      seconds: SCAN_SECONDS,
      allowDuplicates: true, // iOS only; safe to include
      // Optional Android tuning:
      // scanMode: 0, matchMode: 1, reportDelay: 0,
    });

    scanInterval = setInterval(async () => {
      // If we became connected mid-scan, stop scanning & polling immediately
      if (isConnected()) {
        __DEV__ && console.log("scan poll: connected → stopping scan loop");
        await stopScan();
        return;
      }

      try {
        const [disc, conn] = await Promise.all([
          BleManager.getDiscoveredPeripherals([]),
          BleManager.getConnectedPeripherals([]),
        ]);
        let devices = _.uniqBy([...(disc || []), ...(conn || [])], "id");
        __DEV__ &&
          console.log("Inside BleManager Scanning found devices are", devices);
        if (setListFn) setListFn(devices);
      } catch (e) {
        __DEV__ && console.log("scan poll error", e?.message);
      }
    }, 4000);

    return true;
  } catch (e) {
    __DEV__ && console.log("BLE startDeviceScan ERROR", e);
    Alert.alert(
      "Error occurred when trying to scan nearby Bluetooth devices",
      e?.message || String(e),
    );
    isScanning = false;
    return false;
  }
};

const stopScan = async () => {
  try {
    await BleManager.stopScan();
  } catch (e) {
    __DEV__ && console.log("stopScan error:", e?.message);
  } finally {
    if (scanInterval) {
      clearInterval(scanInterval);
      scanInterval = null;
    }
    isScanning = false;
  }
};

const monitorCharacteristic = async (deviceId) => {
  if (!deviceId) {
    __DEV__ && console.log("monitorCharacteristic: no deviceId");
    return;
  }

  await BleManager.retrieveServices(deviceId);

  if (rssiInterval) {
    clearInterval(rssiInterval);
    rssiInterval = null;
  }
  rssiInterval = setInterval(() => rssiRead(deviceId), 2000);

  try {
    await BleManager.startNotification(
      deviceId,
      GLOBALS.SERVICE.ID,
      GLOBALS.SERVICE.CHARACTERISTIC,
    );
  } catch (e) {
    __DEV__ && console.log("startNotification error", e);
  }
};

const connectToDevice = async (device, opts = {}) => {
  const {
    onConnected,
    onTimeoutRetry,
    onTimeoutNo,
    showTimeoutAlert = true,
  } = opts;
  const deviceId = device?.id;
  if (!deviceId) {
    __DEV__ && console.log("connectToDevice: no deviceId");
    return false;
  }

  // Serialize connects
  if (connectInProgress) {
    __DEV__ &&
      console.log("connectToDevice skipped: connect already in progress");
    return false;
  }
  connectInProgress = true;

  // Suppress auto-recovery for a window; initial pairing may drop GATT once.
  suppressRecovery(15000);
  pairingInProgress = true;

  Store.dispatch("Device/CONNECTINGDEVICE", { connectingDeviceId: deviceId });

  let timedOut = false;
  let timeoutId = null;

  try {
    const connectAttempt = (async () => {
      // Stop scanning fully (clears scan interval)
      await stopScan();

      // Disconnect any previous device if still connected (avoid disconnecting the same device)
      const prev = store.getState().device?.id;
      if (prev && prev !== deviceId) {
        try {
          if (await BleManager.isPeripheralConnected(prev)) {
            await BleManager.disconnect(prev);
            __DEV__ && console.log("disconnect previous", prev);
          }
        } catch (e) {
          __DEV__ && console.log("disconnect previous error:", e?.message);
        }
      }

      // Connect (Android may show a single pairing dialog here or on first secured op)
      await BleManager.connect(deviceId);
      if (timedOut) return false;

      // Mark connected immediately so UI can proceed
      Store.dispatch("Device/SET", {
        id: deviceId,
        name: _.truncate(device.name, { length: 8, omission: "" }),
        connected: true,
      });

      // Ensure any background scan loop is fully stopped
      await stopScan();
      if (timedOut) return false;

      if (typeof onConnected === "function") onConnected(deviceId);

      // Services + notifications; if characteristic is protected, OS will prompt (once).
      try {
        await monitorCharacteristic(deviceId);
      } catch (e) {
        __DEV__ && console.log("monitorCharacteristic error", e?.message);
      }

      // Small settle window before allowing any recovery attempts
      await delay(1200);
      return !timedOut;
    })();

    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        const err = new Error("CONNECT_TIMEOUT");
        err.code = "CONNECT_TIMEOUT";
        reject(err);
      }, CONNECT_TIMEOUT_MS);
    });

    const connected = await Promise.race([connectAttempt, timeoutPromise]);
    if (timeoutId) clearTimeout(timeoutId);
    return !!connected;
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    __DEV__ && console.log("connectToDevice error: ", deviceId, error);
    const isTimeout = error?.code === "CONNECT_TIMEOUT";
    const isAndroidImmediateConnectFailure =
      Platform.OS === "android" && !isTimeout;

    if (isTimeout || isAndroidImmediateConnectFailure) {
      try {
        await BleManager.disconnect(deviceId, true);
      } catch (e) {
        __DEV__ && console.log("timeout disconnect error:", e?.message);
      }

      if (showTimeoutAlert) {
        Alert.alert(
          "Device Not Available",
          "This device is not available for connection right now. Search again?",
          [
            {
              text: "No",
              style: "cancel",
              onPress: () => {
                if (typeof onTimeoutNo === "function") onTimeoutNo();
              },
            },
            {
              text: "Yes",
              onPress: () => {
                if (typeof onTimeoutRetry === "function") onTimeoutRetry();
              },
            },
          ],
        );
      }
      return false;
    }

    if (showTimeoutAlert) {
      Alert.alert(
        "Connection failed",
        "Please ensure that the LT600PRO is within proximity and in pairing mode.",
        [
          { text: "Close", style: "cancel" },
          { text: "Reconnect", onPress: () => connectToDevice(device, opts) },
        ],
      );
    }
  } finally {
    pairingInProgress = false;
    connectInProgress = false;
    Store.dispatch("Device/CONNECTINGDEVICE", { connectingDeviceId: null });

    // Keep a short cooldown so any transient disconnect from bonding won't trigger recovery.
    suppressRecovery(2500);
  }
  return false;
};

const reconnectToDevice = async (device) => {
  if (!device || !device.id) {
    __DEV__ && console.log("reconnectToDevice: no deviceId");
    return false;
  }
  // Skip reconnect attempts during pairing/connecting/cooldown
  if (pairingInProgress || connectInProgress || now() < recoverySuppressUntil) {
    __DEV__ && console.log("reconnectToDevice skipped (pair/conn/cooldown)");
    return false;
  }
  return await connectToDevice(device, { showTimeoutAlert: false });
};

const handleManualDisconnect = async (device, error) => {
  const { name, id } = device || {};
  const formattedName = _.split(name || "", " ")[0];

  if (id) {
    try {
      await BleManager.disconnect(id, true);
    } catch (e) {
      __DEV__ && console.log("Error disconnecting", id, e?.message);
    }
  }

  const deviceState = store.getState().device;
  if (deviceState && deviceState.id !== id) return;

  Store.dispatch("Stream/END_SESSION", { heatEndedType: "X" });

  if (error) {
    Alert.alert(
      `${formattedName || "Device"} has disconnected!`,
      "There was a problem reconnecting to the device, please try connecting again manually!",
    );
    __DEV__ && console.log("_handleDisconnect: ", { ...error });
  }

  Store.dispatch("Device/REMOVE");
  // No Store.navigate here; handle navigation in UI.
};

const writeCharacterics = async (deviceId, data) => {
  if (!deviceId) {
    Alert.alert(
      "LT600PRO not found!",
      "Please ensure that you have successfully paired and connected with an LT600PRO in order to modify its settings.",
    );
    __DEV__ && console.log("writeCharacterics: no deviceId");
    throw new Error("writeCharacterics: no deviceId");
  }

  // Wait for pairing/connecting/cooldown to settle instead of dropping writes.
  if (pairingInProgress || connectInProgress || now() < recoverySuppressUntil) {
    const waitMs = Math.max(recoverySuppressUntil - now(), 0) + 150;
    __DEV__ &&
      console.log(`writeCharacterics waiting ${waitMs}ms (pair/conn/cooldown)`);
    await delay(waitMs);
  }

  try {
    const payload = stringToBytes(data);

    if (Platform.OS === "ios") {
      await BleManager.write(
        deviceId,
        GLOBALS.SERVICE.ID,
        GLOBALS.SERVICE.SETTINGS,
        payload,
      );
    } else {
      await BleManager.writeWithoutResponse(
        deviceId,
        GLOBALS.SERVICE.ID,
        GLOBALS.SERVICE.SETTINGS,
        payload,
        50,
      );
    }
  } catch (e) {
    __DEV__ && console.log("writeCharacterics error", e);
    throw e;
  }
};

export default {
  initBleManager,
  stopScan,
  reconnectToDevice,
  connectToDevice,
  scanDevices,
  writeCharacterics,
  handleManualDisconnect,
};
