import { Dimensions, Platform, StatusBar } from "react-native";
import DeviceInfo from "react-native-device-info";
import Orientation from "react-native-orientation-locker";

const OS = Platform.OS;
const isAndroid = OS === "android";
const initialOrientation = Orientation.getInitialOrientation();
const deviceWidth =
  initialOrientation === "PORTRAIT"
    ? Dimensions.get("screen").width
    : Dimensions.get("screen").height;
const deviceHeight =
  initialOrientation === "PORTRAIT"
    ? Dimensions.get("screen").height
    : Dimensions.get("screen").width;
const softwareButtonHeight =
  initialOrientation === "PORTRAIT"
    ? Dimensions.get("screen").height - Dimensions.get("window").height
    : Dimensions.get("screen").width - Dimensions.get("window").width;
const deviceVersion = DeviceInfo.getReadableVersion();
const isTablet = DeviceInfo.isTablet();
const urlSuffix = __DEV__ ? "dev2" : "production2";
// const accountUrl = `https://ecoaims-account-dev2.azurewebsites.net`;
// const backendUrl = `https://ecoaims-backend-dev2.azurewebsites.net`;
const accountUrl = `https://ecoaims-account-${urlSuffix}.azurewebsites.net`;
const backendUrl = `https://ecoaims-backend-${urlSuffix}.azurewebsites.net`;
//const accountUrl = 'https://192.168.68.60:5001';

export const exportTargetImage = `https://ecoaims-svg-to-img-api-unix.azurewebsites.net/api/ecoaims-svg-to-img-api`;
const apiLevel =
  typeof Platform.Version === "string"
    ? parseInt(Platform.Version, 10)
    : (Platform.Version as number);

export const GLOBALS = {
  DEVICE: {
    NEEDS_BONDING: true, // turn bonding flow on/off
    FORCE_REBOND: false, // remove old bond before bonding (forces prompt)
    BONDING_STRATEGY: "post",
    HEIGHT: deviceHeight,
    IS_ANDROID: isAndroid,
    IS_TABLET: isTablet,
    IS_ANDROID_12_OR_OVER: isAndroid && apiLevel >= 31,
    // IS_ANDROID_12_OR_OVER: isAndroid && parseInt(apiLevel) >= 34,
    VERSION: deviceVersion,
    WIDTH: deviceWidth,
    IS_LOCATION_REQUIRED: isAndroid && apiLevel <= 30,
    // IS_LOCATION_REQUIRED: parseInt(apiLevel) > 22,
    SOFTWARE_BUTTON_HEIGHT: softwareButtonHeight,
    STATUS_BAR_HEIGHT: StatusBar.currentHeight ? StatusBar.currentHeight : 0,
  },
  API: {
    ACCOUNT_URL: accountUrl,
    BACKEND_URL: backendUrl,
  },
  SERVICE: {
    ID: "0bd51666-e7cb-469b-8e4d-2742f1ba77cc",
    CHARACTERISTIC: "e7add780-b042-4876-aae1-11285535f821",
    SETTINGS: "e7add780-b042-4876-aae1-11285535f721",
  },
  AUTH_CONFIG: {
    issuer: accountUrl,
    serviceConfiguration: {
      authorizationEndpoint: `${accountUrl}/connect/authorize`,
      tokenEndpoint: `${accountUrl}/connect/token`,
      revocationEndpoint: `${accountUrl}/connect/revocation`,
      endSessionEndpoint: `${accountUrl}/connect/endsession`,
    },
    clientId: "ecoaims-application",
    redirectUrl: "com.ekoaims.ecoaims:/oauthredirect",
    scopes: [
      "openid",
      "profile",
      "email",
      "ecoaims_authorization",
      "backend_my",
      "users_my",
      "offline_access",
    ],
  },
  APP_STORE_INFO: {
    ANDROID_ID: "com.ekoaims.ecoaims",
    IOS_ID: "1609962599",
  },
};

export const COLORS = {
  /* Basic */
  BLACK: (opacity = 100) => {
    const calcOpacity = opacity / 100;
    return `rgba(0, 0, 0, ${calcOpacity})`;
  },
  WHITE: (opacity = 100) => {
    const calcOpacity = opacity / 100;
    return `rgba(255, 255, 255, ${calcOpacity})`;
  },
  /* Ecoaims colors */
  ECO_DARK_GREY: "#272724",
  ECO_GREEN: (opacity = 100) => {
    const calcOpacity = opacity / 100;
    return `rgba(179, 253, 13, ${calcOpacity})`;
  },
  ECO_RED: (opacity = 100) => {
    const calcOpacity = opacity / 100;
    return `rgba(253, 13, 13, ${calcOpacity})`;
  },
  ECO_BLOCK_GREEN: "#86C70A",
  ECO_MEDIUM_GREEN: "#71A204",
  ECO_DARK_GREEN: "#2A6C00",
  TARGET_GREY: "#E8E8E8",
  DARK_GREY: "#4a6075",
  BLUETOOTH_BLUE: "#0f3f8f",
  TRANSPARENT: "rgba(0, 0, 0, 0)",
  CONTAINER: "rgba(255, 0, 255, 0.2)",
  ECO_WARNING: "#F2D64B",
  LED_OFF_COLOR: "#36454F",
};
