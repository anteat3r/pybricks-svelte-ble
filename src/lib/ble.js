
// Pybricks Bluetooth LE logic
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

let device;
let server;
let service;
let characteristic;
let capabilitiesCharacteristic;

export async function connect(onStatusChange, onDataReceived, onError) {
    try {
        if (!navigator.bluetooth) {
            throw new Error('Web Bluetooth is not supported in this browser.');
        }

        onStatusChange('Requesting device...');
        device = await navigator.bluetooth.requestDevice({
            filters: [{ services: [PYBRICKS_SERVICE_UUID] }],
            optionalServices: [PYBRICKS_SERVICE_UUID]
        });

        device.addEventListener('gattserverdisconnected', () => {
            onStatusChange('Disconnected');
        });

        onStatusChange('Connecting to GATT Server...');
        server = await device.gatt.connect();

        onStatusChange('Getting Primary Service...');
        service = await server.getPrimaryService(PYBRICKS_SERVICE_UUID);

        onStatusChange('Getting Characteristics...');
        characteristic = await service.getCharacteristic(PYBRICKS_CONTROL_CHARACTERISTIC_UUID);
        
        try {
            capabilitiesCharacteristic = await service.getCharacteristic(PYBRICKS_HUB_CAPABILITIES_CHARACTERISTIC_UUID);
        } catch (e) {
            console.warn('Capabilities characteristic not found', e);
        }

        onStatusChange('Starting Notifications...');
        await characteristic.startNotifications();

        characteristic.addEventListener('characteristicvaluechanged', (event) => {
            const value = event.target.value;
            const data = new Uint8Array(value.buffer);
            onDataReceived(data);
        });

        onStatusChange('Connected');
        return true;

    } catch (error) {
        console.error('Connection failed', error);
        onError(error.message);
        return false;
    }
}

export async function readCapabilities() {
    if (!capabilitiesCharacteristic) return 0;
    const value = await capabilitiesCharacteristic.readValue();
    let flags = 0;
    // Handle different sizes of capabilities flags (up to 32 bits potentially, though usually small)
    if (value.byteLength === 1) flags = value.getUint8(0);
    else if (value.byteLength === 2) flags = value.getUint16(0, true);
    else if (value.byteLength === 4) flags = value.getUint32(0, true);
    return flags;
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

export function disconnect() {
    if (device && device.gatt.connected) {
        device.gatt.disconnect();
    }
}

export async function sendCommand(commandCode, payload = []) {
    if (!characteristic) {
        throw new Error('Not connected');
    }
    const data = new Uint8Array([commandCode, ...payload]);
    await characteristic.writeValueWithResponse(data);
}

// Higher level command helpers
export async function stopUserProgram() {
    await sendCommand(COMMAND_STOP_USER_PROGRAM); 
}

export async function startUserProgram(slot = 0) {
    await sendCommand(COMMAND_START_USER_PROGRAM, [slot]);
}

export async function startRepl() {
    await sendCommand(COMMAND_START_USER_PROGRAM, [BUILTIN_PROGRAM_REPL]);
}

export async function startPortView() {
    await sendCommand(COMMAND_START_USER_PROGRAM, [BUILTIN_PROGRAM_PORT_VIEW]);
}

export async function startImuCalibration() {
    await sendCommand(COMMAND_START_USER_PROGRAM, [BUILTIN_PROGRAM_IMU_CALIBRATION]);
}

export async function writeStdin(text) {
    const encoder = new TextEncoder();
    const payload = encoder.encode(text);
    await sendCommand(COMMAND_WRITE_STDIN, payload);
}

export async function writeAppData(offset, payload) {
    const buffer = new ArrayBuffer(2 + payload.byteLength);
    const view = new DataView(buffer);
    view.setUint16(0, offset, true);
    new Uint8Array(buffer).set(new Uint8Array(payload), 2);
    await sendCommand(COMMAND_WRITE_APP_DATA, new Uint8Array(buffer));
}

export async function resetInUpdateMode() {
    await sendCommand(COMMAND_RESET_IN_UPDATE_MODE);
}

export function parseStatusReport(payload) {
    // payload is a DataView starting at the flag bytes (offset 1 from the original event msg)
    // Wait, the caller passes the full payload or just the slice?
    // In App.svelte: 
    // const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    // flags = parseStatusFlags(view.getUint32(0, true));
    
    // Let's refactor App.svelte to use this function properly or update this to accept the view.
    // But for now, let's keep the signature compatible or return an object.
    
    // We'll assume the caller passes the DataView of the payload (excluding the event type byte if done in App.svelte, 
    // BUT App.svelte does: `const payload = data.slice(1); ... view.getUint32(0, true)`
    
    // So here we receive the flags integer? No, let's change `parseStatusFlags` to `parseStatusReport` in App.svelte too.
    return {};
}

// Helper to decode flags integer
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

function createWriteUserProgramMetaCommand(size) {
    const buffer = new ArrayBuffer(5);
    const view = new DataView(buffer);
    view.setUint8(0, COMMAND_WRITE_USER_PROGRAM_META);
    view.setUint32(1, size, true);
    return new Uint8Array(buffer);
}

function createWriteUserRamCommand(offset, payload) {
    const buffer = new ArrayBuffer(5 + payload.byteLength);
    const view = new DataView(buffer);
    view.setUint8(0, COMMAND_WRITE_USER_RAM);
    view.setUint32(1, offset, true);
    const uint8Payload = new Uint8Array(payload);
    new Uint8Array(buffer).set(uint8Payload, 5);
    return new Uint8Array(buffer);
}

let lastUploadedBinary = null;

export async function uploadProgram(fileData, onProgress) {
    if (!characteristic) throw new Error('Not connected');

    // 1. Find where the new program differs from the old one
    let startIndex = 0;
    if (lastUploadedBinary) {
        // Compare buffers
        const minLen = Math.min(fileData.byteLength, lastUploadedBinary.byteLength);
        let diffIndex = 0;
        while (diffIndex < minLen && fileData[diffIndex] === lastUploadedBinary[diffIndex]) {
            diffIndex++;
        }

        // If identical and size is same, no upload needed (but we restart)
        if (diffIndex === minLen && fileData.byteLength === lastUploadedBinary.byteLength) {
            console.log('Program identical, skipping upload.');
            await startUserProgram(0);
            if (onProgress) onProgress(1);
            return;
        }

        // Align start index to chunk size boundary downwards to be safe/simple
        const CHUNK_SIZE = 100;
        startIndex = Math.floor(diffIndex / CHUNK_SIZE) * CHUNK_SIZE;
        console.log(`Incremental upload starting at offset ${startIndex} (diff at ${diffIndex})`);
    }

    const metaCmd0 = createWriteUserProgramMetaCommand(0);
    await characteristic.writeValueWithResponse(metaCmd0);

    const CHUNK_SIZE = 100; 
    // Start from the calculated offset
    for (let i = startIndex; i < fileData.byteLength; i += CHUNK_SIZE) {
        const chunk = fileData.slice(i, i + CHUNK_SIZE);
        const ramCmd = createWriteUserRamCommand(i, chunk);
        await characteristic.writeValueWithResponse(ramCmd);
        if (onProgress) onProgress((i + chunk.byteLength) / fileData.byteLength);
    }

    const metaCmdFinal = createWriteUserProgramMetaCommand(fileData.byteLength);
    await characteristic.writeValueWithResponse(metaCmdFinal);
    
    // Store for next time (clone it to be safe)
    lastUploadedBinary = new Uint8Array(fileData);
    
    await startUserProgram(0);
}
