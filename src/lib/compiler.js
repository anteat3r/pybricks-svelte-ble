import { compile as mpyCrossCompile } from '@pybricks/mpy-cross-v6';
import wasmUrl from '@pybricks/mpy-cross-v6/build/mpy-cross-v6.wasm?url';

const encoder = new TextEncoder();

function cString(str) {
    return encoder.encode(str + '\x00');
}

function encodeUInt32LE(value) {
    const buf = new ArrayBuffer(4);
    const view = new DataView(buf);
    view.setUint32(0, value, true);
    return new Uint8Array(buf);
}

export async function compile(script) {
    const result = await mpyCrossCompile(
        'main.py',
        script,
        undefined, // options
        wasmUrl
    );

    if (result.status !== 0 || !result.mpy) {
        throw new Error(result.err ? result.err.join('\n') : 'Unknown compilation error');
    }

    // Wrap in multi-mpy format
    // [size (uint32le)] [filename (cstr)] [mpy_data]
    // The module name MUST be "__main__" for the hub to run it automatically.
    const moduleName = '__main__';
    const mpyData = result.mpy;
    
    const sizeBytes = encodeUInt32LE(mpyData.length);
    const nameBytes = cString(moduleName);
    
    const totalLength = sizeBytes.length + nameBytes.length + mpyData.length;
    const finalBuffer = new Uint8Array(totalLength);
    
    finalBuffer.set(sizeBytes, 0);
    finalBuffer.set(nameBytes, 4);
    finalBuffer.set(mpyData, 4 + nameBytes.length);
    
    return finalBuffer;
}
