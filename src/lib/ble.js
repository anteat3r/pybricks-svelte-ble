import * as protocol from './protocol.js';

// Re-export protocol for consumers
export * from './protocol.js';

let transport = null;
let relaySocket = null;
let onStatusChangeCallback = null;
let onDataReceivedCallback = null;
let onErrorCallback = null;

// Capabilities state
let maxWriteSize = 100; // Default safe value
let capabilitiesCharacteristic = null; // Specific to BLE transport

// --- Transports ---

class BLETransport {
    constructor() {
        this.device = null;
        this.server = null;
        this.service = null;
        this.characteristic = null;
    }

    async connect() {
        if (!navigator.bluetooth) {
            throw new Error('Web Bluetooth is not supported.');
        }

        onStatusChangeCallback('Requesting device...');
        this.device = await navigator.bluetooth.requestDevice({
            filters: [{ services: [protocol.PYBRICKS_SERVICE_UUID] }],
            optionalServices: [protocol.PYBRICKS_SERVICE_UUID]
        });

        this.device.addEventListener('gattserverdisconnected', () => {
            onStatusChangeCallback('Disconnected');
            transport = null;
        });

        onStatusChangeCallback('Connecting to GATT Server...');
        this.server = await this.device.gatt.connect();

        onStatusChangeCallback('Getting Primary Service...');
        this.service = await this.server.getPrimaryService(protocol.PYBRICKS_SERVICE_UUID);

        onStatusChangeCallback('Getting Characteristics...');
        this.characteristic = await this.service.getCharacteristic(protocol.PYBRICKS_CONTROL_CHARACTERISTIC_UUID);
        
        // Try getting capabilities char
        try {
            capabilitiesCharacteristic = await this.service.getCharacteristic(protocol.PYBRICKS_HUB_CAPABILITIES_CHARACTERISTIC_UUID);
        } catch (e) {
            console.warn('Capabilities characteristic not found', e);
            capabilitiesCharacteristic = null;
        }

        onStatusChangeCallback('Starting Notifications...');
        await this.characteristic.startNotifications();

        this.characteristic.addEventListener('characteristicvaluechanged', (event) => {
            const value = event.target.value;
            const data = new Uint8Array(value.buffer);
            handleDataReceived(data);
        });

        return true;
    }

    async write(data) {
        if (!this.characteristic) throw new Error('Not connected');
        await this.characteristic.writeValueWithResponse(data);
    }

    async readCapabilities() {
        if (!capabilitiesCharacteristic) return null;
        return await capabilitiesCharacteristic.readValue();
    }

    disconnect() {
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        }
    }
}

class WebSocketTransport {
    constructor(url) {
        this.url = url;
        this.ws = null;
    }

    async connect() {
        return new Promise((resolve, reject) => {
            onStatusChangeCallback('Connecting to Socket...');
            this.ws = new WebSocket(this.url);
            this.ws.binaryType = 'arraybuffer';

            this.ws.onopen = () => {
                onStatusChangeCallback('Connected (Virtual)');
                resolve(true);
            };

            this.ws.onmessage = (event) => {
                // Incoming data from "Virtual Hub"
                if (event.data instanceof ArrayBuffer) {
                    handleDataReceived(new Uint8Array(event.data));
                } else if (typeof event.data === 'string') {
                    // Maybe JSON command? For now assume raw data is binary
                    try {
                        const json = JSON.parse(event.data);
                        if (json.type === 'data') {
                            // Base64 or array?
                            // handleDataReceived(...) 
                        }
                    } catch(e) {}
                }
            };

            this.ws.onclose = () => {
                onStatusChangeCallback('Disconnected');
                transport = null;
            };

            this.ws.onerror = (e) => {
                onErrorCallback('WebSocket Error');
                reject(e);
            };
        });
    }

    async write(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(data);
        } else {
            throw new Error('Socket not connected');
        }
    }

    async readCapabilities() {
        // Virtual hub capabilities?
        // We could simulate them or ask the remote.
        // For now return null (defaults)
        return null; 
    }

    disconnect() {
        if (this.ws) this.ws.close();
    }
}

// --- Core Logic ---

function handleDataReceived(data) {
    // 1. Update UI
    if (onDataReceivedCallback) onDataReceivedCallback(data);

    // 2. Relay to Socket if enabled
    if (relaySocket && relaySocket.readyState === WebSocket.OPEN) {
        relaySocket.send(data);
    }
}

export async function connect(onStatusChange, onDataReceived, onError) {
    onStatusChangeCallback = onStatusChange;
    onDataReceivedCallback = onDataReceived;
    onErrorCallback = onError;

    transport = new BLETransport();
    const success = await transport.connect();
    if (success) onStatusChange('Connected');
    return success;
}

export async function connectVirtual(url, onStatusChange, onDataReceived, onError) {
    onStatusChangeCallback = onStatusChange;
    onDataReceivedCallback = onDataReceived;
    onErrorCallback = onError;

    transport = new WebSocketTransport(url);
    const success = await transport.connect();
    // transport.connect calls onStatusChange
    return success;
}

export function setRelay(ws) {
    relaySocket = ws;
    if (relaySocket) {
        // Also listen for commands from relay socket to send to Hub
        relaySocket.addEventListener('message', async (event) => {
            if (transport && event.data instanceof ArrayBuffer) {
                // Received binary command from relay -> Forward to Hub
                try {
                    await transport.write(new Uint8Array(event.data));
                } catch (e) {
                    console.error('Failed to relay command to hub', e);
                }
            } else if (transport && typeof event.data === 'string') {
                 // Maybe a JSON command wrapper?
            }
        });
    }
}

export function disconnect() {
    if (transport) transport.disconnect();
}

export async function readCapabilities() {
    if (!transport) return { flags: 0 };
    
    const value = await transport.readCapabilities();
    
    if (value && value.byteLength >= 6) {
        maxWriteSize = value.getUint16(0, true);
        const flags = value.getUint32(2, true);
        const maxUserProgramSize = value.getUint32(6, true);
        console.log(`Hub Capabilities: MaxWrite=${maxWriteSize}, Flags=${flags.toString(16)}`);
        return { flags, maxUserProgramSize };
    }
    
    return { flags: 0 };
}

// Generic Send Helper
export async function sendCommand(commandCode, payload = []) {
    if (!transport) throw new Error('Not connected');
    const data = new Uint8Array([commandCode, ...payload]);
    await transport.write(data);
}

// --- Higher Level Commands (Using protocol helpers) ---

export async function stopUserProgram() {
    if (!transport) return;
    await transport.write(protocol.createStopUserProgramCommand());
}

export async function startUserProgram(slot = 0) {
    if (!transport) return;
    await transport.write(protocol.createStartUserProgramCommand(slot));
}

export async function startRepl() {
    await startUserProgram(protocol.BUILTIN_PROGRAM_REPL);
}

export async function startPortView() {
    await startUserProgram(protocol.BUILTIN_PROGRAM_PORT_VIEW);
}

export async function startImuCalibration() {
    await startUserProgram(protocol.BUILTIN_PROGRAM_IMU_CALIBRATION);
}

export async function writeStdin(text) {
    if (!transport) return;
    await transport.write(protocol.createWriteStdinCommand(text));
}

export async function writeAppData(offset, payload) {
    if (!transport) return;
    await transport.write(protocol.createWriteAppDataCommand(offset, payload));
}

export async function resetInUpdateMode() {
    if (!transport) return;
    await transport.write(protocol.createResetInUpdateModeCommand());
}

let lastUploadedBinary = null;

export async function uploadProgram(fileData, onProgress) {
    if (!transport) throw new Error('Not connected');

    // Use negotiated chunk size minus command overhead (5 bytes)
    const CHUNK_SIZE = Math.max(20, maxWriteSize - 5);

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

        // Align start index to chunk size boundary downwards
        startIndex = Math.floor(diffIndex / CHUNK_SIZE) * CHUNK_SIZE;
        console.log(`Incremental upload starting at offset ${startIndex} (diff at ${diffIndex})`);
    }

    const metaCmd0 = protocol.createWriteUserProgramMetaCommand(0);
    await transport.write(metaCmd0);

    // Start from the calculated offset
    for (let i = startIndex; i < fileData.byteLength; i += CHUNK_SIZE) {
        const chunk = fileData.slice(i, i + CHUNK_SIZE);
        const ramCmd = protocol.createWriteUserRamCommand(i, chunk);
        await transport.write(ramCmd);
        if (onProgress) onProgress((i + chunk.byteLength) / fileData.byteLength);
    }

    const metaCmdFinal = protocol.createWriteUserProgramMetaCommand(fileData.byteLength);
    await transport.write(metaCmdFinal);
    
    // Store for next time (clone it to be safe)
    lastUploadedBinary = new Uint8Array(fileData);
    
    await startUserProgram(0);
}