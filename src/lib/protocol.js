// Pybricks Protocol Definitions

// Service UUIDs
export const PYBRICKS_SERVICE_UUID = 'c5f50001-8280-46da-89f4-6d8051e4aeef';
export const PYBRICKS_CONTROL_CHARACTERISTIC_UUID = 'c5f50002-8280-46da-89f4-6d8051e4aeef';
export const PYBRICKS_HUB_CAPABILITIES_CHARACTERISTIC_UUID = 'c5f50003-8280-46da-89f4-6d8051e4aeef';

// Event Types
export const EVENT_STATUS_REPORT = 0;
export const EVENT_WRITE_STDOUT = 1;
export const EVENT_WRITE_APP_DATA = 2;

// Command Types
export const COMMAND_STOP_USER_PROGRAM = 0;
export const COMMAND_START_USER_PROGRAM = 1;
export const COMMAND_START_REPL = 2; // Legacy/Built-in
export const COMMAND_WRITE_USER_PROGRAM_META = 3;
export const COMMAND_WRITE_USER_RAM = 4;
export const COMMAND_RESET_IN_UPDATE_MODE = 5;
export const COMMAND_WRITE_STDIN = 6;
export const COMMAND_WRITE_APP_DATA = 7;

// Status Flags
export const STATUS_BATTERY_LOW_VOLTAGE_WARNING = 0;
export const STATUS_BATTERY_LOW_VOLTAGE_SHUTDOWN = 1;
export const STATUS_BATTERY_HIGH_CURRENT = 2;
export const STATUS_BLE_ADVERTISING = 3;
export const STATUS_BLE_LOW_SIGNAL = 4;
export const STATUS_POWER_BUTTON_PRESSED = 5;
export const STATUS_USER_PROGRAM_RUNNING = 6;
export const STATUS_SHUTDOWN = 7;

// Hub Capabilities Flags
export const HUB_CAPABILITY_HAS_REPL = 1 << 0;
export const HUB_CAPABILITY_USER_PROGRAM_MULTI_MPY6 = 1 << 1;
export const HUB_CAPABILITY_USER_PROGRAM_MULTI_MPY6_NATIVE6P1 = 1 << 2;
export const HUB_CAPABILITY_HAS_PORT_VIEW = 1 << 3;
export const HUB_CAPABILITY_HAS_IMU_CALIBRATION = 1 << 4;

// Built-in Program IDs
export const BUILTIN_PROGRAM_REPL = 0x80;
export const BUILTIN_PROGRAM_PORT_VIEW = 0x81;
export const BUILTIN_PROGRAM_IMU_CALIBRATION = 0x82;

// Parsing Helpers
export function parseStatusReport(payload) {
    // This function can be expanded if we need more structured parsing of the status report
    // currently App.svelte handles the raw dataview mostly, but we can move logic here if needed.
    return {};
}

export function decodeStatusFlags(flags) {
    return {
        batteryLowVoltageWarning: !!(flags & (1 << STATUS_BATTERY_LOW_VOLTAGE_WARNING)),
        batteryLowVoltageShutdown: !!(flags & (1 << STATUS_BATTERY_LOW_VOLTAGE_SHUTDOWN)),
        batteryHighCurrent: !!(flags & (1 << STATUS_BATTERY_HIGH_CURRENT)),
        bleAdvertising: !!(flags & (1 << STATUS_BLE_ADVERTISING)),
        bleLowSignal: !!(flags & (1 << STATUS_BLE_LOW_SIGNAL)),
        powerButtonPressed: !!(flags & (1 << STATUS_POWER_BUTTON_PRESSED)),
        userProgramRunning: !!(flags & (1 << STATUS_USER_PROGRAM_RUNNING)),
        shutdown: !!(flags & (1 << STATUS_SHUTDOWN))
    };
}

export function parseCapabilities(flags) {
    return {
        hasRepl: !!(flags & HUB_CAPABILITY_HAS_REPL),
        userProgramMultiMpy6: !!(flags & HUB_CAPABILITY_USER_PROGRAM_MULTI_MPY6),
        userProgramMultiMpy6Native6p1: !!(flags & HUB_CAPABILITY_USER_PROGRAM_MULTI_MPY6_NATIVE6P1),
        hasPortView: !!(flags & HUB_CAPABILITY_HAS_PORT_VIEW),
        hasImuCalibration: !!(flags & HUB_CAPABILITY_HAS_IMU_CALIBRATION)
    };
}

// Command Builders
export function createWriteUserProgramMetaCommand(size) {
    const buffer = new ArrayBuffer(5);
    const view = new DataView(buffer);
    view.setUint8(0, COMMAND_WRITE_USER_PROGRAM_META);
    view.setUint32(1, size, true);
    return new Uint8Array(buffer);
}

export function createWriteUserRamCommand(offset, payload) {
    const buffer = new ArrayBuffer(5 + payload.byteLength);
    const view = new DataView(buffer);
    view.setUint8(0, COMMAND_WRITE_USER_RAM);
    view.setUint32(1, offset, true);
    const uint8Payload = new Uint8Array(payload);
    new Uint8Array(buffer).set(uint8Payload, 5);
    return new Uint8Array(buffer);
}

export function createStartUserProgramCommand(slot = 0) {
    // Note: StartUserProgram format depends on protocol version but simplified here
    const buffer = new ArrayBuffer(2);
    const view = new DataView(buffer);
    view.setUint8(0, COMMAND_START_USER_PROGRAM);
    view.setUint8(1, slot); // Slot logic if needed
    return new Uint8Array(buffer);
}

export function createStopUserProgramCommand() {
    const buffer = new ArrayBuffer(1);
    const view = new DataView(buffer);
    view.setUint8(0, COMMAND_STOP_USER_PROGRAM);
    return new Uint8Array(buffer);
}

export function createWriteStdinCommand(text) {
    const encoder = new TextEncoder();
    const payload = encoder.encode(text);
    const buffer = new ArrayBuffer(1 + payload.byteLength);
    const view = new DataView(buffer);
    view.setUint8(0, COMMAND_WRITE_STDIN);
    new Uint8Array(buffer).set(payload, 1);
    return new Uint8Array(buffer);
}

export function createWriteAppDataCommand(offset, payload) {
    const buffer = new ArrayBuffer(1 + 2 + payload.byteLength);
    const view = new DataView(buffer);
    view.setUint8(0, COMMAND_WRITE_APP_DATA);
    view.setUint16(1, offset, true);
    new Uint8Array(buffer).set(new Uint8Array(payload), 3);
    return new Uint8Array(buffer);
}

export function createResetInUpdateModeCommand() {
    const buffer = new ArrayBuffer(1);
    const view = new DataView(buffer);
    view.setUint8(0, COMMAND_RESET_IN_UPDATE_MODE);
    return new Uint8Array(buffer);
}
