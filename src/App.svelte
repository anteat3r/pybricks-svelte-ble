<script>
  import { 
    connect, disconnect, stopUserProgram, uploadProgram, decodeStatusFlags,
    readCapabilities, parseCapabilities,
    startUserProgram, startRepl, startPortView, startImuCalibration,
    writeStdin, writeAppData, resetInUpdateMode,
    EVENT_STATUS_REPORT, EVENT_WRITE_STDOUT, EVENT_WRITE_APP_DATA
  } from './lib/ble';
  import { compile } from './lib/compiler';
  import * as storage from './lib/storage';
  import Editor from './lib/Editor.svelte';

  let status = $state('Disconnected');
  let logs = $state([]);
  let terminalOutput = $state('');
  let appDataLogs = $state([]);
  let isConnected = $state(false);
  let uploadProgress = $state(0);
  let isUploading = $state(false);
  
  // File System State
  let files = $state(storage.getFiles());
  let activeFileId = $state(null);
  let activeFile = $derived(files.find(f => f.id === activeFileId));
  
  // UI State
  let activeTab = $state('terminal');

  // Initialization: Select first file if available
  $effect(() => {
    if (files.length > 0 && activeFileId === null) {
      activeFileId = files[0].id;
    }
  });

  const examplePrograms = [
    { name: 'Hello World', code: 'print("Hello from Pybricks!")' },
    { name: 'Battery Info', code: 'from pybricks.hubs import ThisHub\nhub = ThisHub()\nprint("Voltage:", hub.battery.voltage())' },
    { name: 'Blink Status Light', code: 'from pybricks.hubs import ThisHub\nfrom pybricks.parameters import Color\nfrom pybricks.tools import wait\nhub = ThisHub()\nwhile True:\n    hub.light.on(Color.RED)\n    wait(500)\n    hub.light.on(Color.BLUE)\n    wait(500)' },
    { name: 'Stdin Echo', code: 'import sys\nprint("Type something...")\nwhile True:\n    line = sys.stdin.readline()\n    print("You said:", line.strip())' }
  ];

  // Status Flags
  let flags = $state({
    batteryLowVoltageWarning: false,
    batteryLowVoltageShutdown: false,
    batteryHighCurrent: false,
    bleAdvertising: false,
    bleLowSignal: false,
    powerButtonPressed: false,
    userProgramRunning: false,
    shutdown: false
  });

  // Hub Capabilities
  let capabilities = $state({
    hasRepl: false,
    userProgramMultiMpy6: false,
    userProgramMultiMpy6Native6p1: false,
    hasPortView: false,
    hasImuCalibration: false
  });

  let runningProgId = $state(0);
  let selectedSlot = $state(0);

  // Inputs
  let stdinInput = $state('');
  let appDataOffset = $state(0);
  let appDataPayload = $state('');
  let startProgramSlot = $state(0);

  const decoder = new TextDecoder();

  function addLog(message) {
    const timestamp = new Date().toLocaleTimeString();
    logs = [`[${timestamp}] ${message}`, ...logs];
  }

  async function handleStatusChange(newStatus) {
    status = newStatus;
    addLog(`Status: ${newStatus}`);
    isConnected = newStatus === 'Connected';
    
    if (isConnected) {
        try {
            const caps = await readCapabilities();
            capabilities = parseCapabilities(caps);
            addLog('Capabilities read.');
        } catch (e) {
            addLog('Failed to read capabilities');
        }
    }
  }

  function handleDataReceived(data) {
    if (data.length === 0) return;
    const eventType = data[0];
    const payload = data.slice(1);

    if (eventType === EVENT_WRITE_STDOUT) {
        terminalOutput += decoder.decode(payload);
    } else if (eventType === EVENT_STATUS_REPORT) {
        if (payload.length >= 4) {
            const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
            flags = decodeStatusFlags(view.getUint32(0, true));
            if (payload.length > 4) runningProgId = payload[4];
            if (payload.length > 5) selectedSlot = payload[5];
        }
    } else if (eventType === EVENT_WRITE_APP_DATA) {
        const hex = Array.from(payload).map(b => b.toString(16).padStart(2, '0')).join(' ');
        appDataLogs = [`[${new Date().toLocaleTimeString()}] AppData: ${hex}`, ...appDataLogs];
    }
  }

  // File Actions
  function createNewFile() {
    const name = prompt('File name:', 'main.py') || 'new.py';
    const newFile = storage.createFile(name);
    files = storage.getFiles();
    activeFileId = newFile.id;
  }

  function loadExample(ex) {
    const newFile = storage.createFile(ex.name + '.py', ex.code);
    files = storage.getFiles();
    activeFileId = newFile.id;
    addLog(`Loaded example: ${ex.name}`);
  }

  async function runExample(ex) {
    if (!isConnected) { alert('Connect to hub first!'); return; }
    addLog(`Running example: ${ex.name}...`);
    try {
        const buffer = await compile(ex.code);
        await uploadProgram(buffer);
        addLog(`${ex.name} sent!`);
    } catch (err) {
        addLog(`Error: ${err.message}`);
    }
  }

  function deleteActiveFile() {
    if (!activeFileId || !confirm('Delete file?')) return;
    storage.deleteFile(activeFileId);
    files = storage.getFiles();
    activeFileId = files.length > 0 ? files[0].id : null;
  }

  function renameActiveFile() {
    if (!activeFile) return;
    const name = prompt('New name:', activeFile.name);
    if (name) {
      storage.renameFile(activeFileId, name);
      files = storage.getFiles();
    }
  }

  function handleEditorChange(e) {
    if (!activeFileId) return;
    storage.updateFile(activeFileId, { content: e.target.value });
    files = storage.getFiles();
  }

  async function handleCompileRun() {
    if (!activeFile) return;
    isUploading = true;
    uploadProgress = 0;
    terminalOutput = '';
    activeTab = 'terminal';
    addLog(`Compiling ${activeFile.name}...`);
    try {
        const buffer = await compile(activeFile.content);
        addLog(`Compilation successful. Uploading...`);
        await uploadProgram(buffer, (p) => uploadProgress = Math.round(p * 100));
        addLog(`${activeFile.name} started!`);
    } catch (err) {
        addLog(`Failed: ${err.message}`);
    } finally {
        isUploading = false;
    }
  }

  async function handleSendStdin() {
    if (!stdinInput) return;
    try {
        await writeStdin(stdinInput + '\n');
        stdinInput = '';
    } catch (err) { addLog(`Error: ${err.message}`); }
  }

  async function handleSendAppData() {
    try {
        const bytes = new Uint8Array(appDataPayload.split(' ').map(h => parseInt(h, 16)));
        await writeAppData(appDataOffset, bytes);
        addLog(`TX AppData: Offset=${appDataOffset}`);
    } catch (err) { addLog(`Error: ${err.message}`); }
  }
</script>

<main class="app-container">
  <nav class="top-nav">
    <div class="brand">PYBRICKS <span>IDE</span></div>
    <div class="hub-info">
      <span class="status-dot" class:connected={isConnected}></span>
      <span class="status-text">{status}</span>
      {#if isConnected}
        <div class="v-divider"></div>
        <div class="battery-pill" class:low={flags.batteryLowVoltageWarning} class:critical={flags.batteryLowVoltageShutdown}>
          {flags.batteryLowVoltageShutdown ? 'CRITICAL BAT' : flags.batteryLowVoltageWarning ? 'LOW BAT' : 'BAT OK'}
        </div>
        {#if flags.userProgramRunning}
          <div class="running-pill">RUNNING</div>
        {/if}
      {/if}
    </div>
    <div class="nav-actions">
        {#if !isConnected}
            <button class="primary" onclick={() => connect(handleStatusChange, handleDataReceived, e => addLog(e))}>Connect Hub</button>
        {:else}
            <button class="danger" onclick={stopUserProgram}>STOP</button>
            <button class="secondary" onclick={disconnect}>Disconnect</button>
        {/if}
    </div>
  </nav>

  <div class="workbench">
    <!-- Explorer Sidebar -->
    <aside class="sidebar explorer">
        <div class="panel-header">EXPLORER</div>
        <div class="sidebar-section">
            <div class="section-header">
                <span>FILES</span>
                <div class="actions">
                    <button class="icon-btn" onclick={createNewFile} title="New File">+</button>
                    <label class="icon-btn" title="Import File">
                        ↑<input type="file" onchange={handleImport} style="display:none">
                    </label>
                </div>
            </div>
            <div class="list">
                {#each files as f}
                    <button class="item" class:active={f.id === activeFileId} onclick={() => activeFileId = f.id}>
                        <span class="icon">py</span> {f.name}
                    </button>
                {/each}
            </div>
        </div>

        <div class="sidebar-section">
            <div class="section-header">EXAMPLES</div>
            <div class="list">
                {#each examplePrograms as ex}
                    <div class="item-row">
                        <button class="item example" onclick={() => loadExample(ex)}>
                            <span class="icon">ex</span> {ex.name}
                        </button>
                        <button class="icon-btn small-play" onclick={() => runExample(ex)} title="Run immediately">▶</button>
                    </div>
                {/each}
            </div>
        </div>
    </aside>

    <!-- Editor Area -->
    <section class="editor-main">
        {#if activeFile}
            <div class="toolbar">
                <div class="tabs"><div class="tab active">{activeFile.name}</div></div>
                <div class="actions">
                    <button class="icon-btn" onclick={renameActiveFile} title="Rename">✎</button>
                    <button class="icon-btn" onclick={() => {
                        const blob = new Blob([activeFile.content], { type: 'text/plain' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url; a.download = activeFile.name; a.click();
                        URL.revokeObjectURL(url);
                    }} title="Download">↓</button>
                    <button class="icon-btn danger" onclick={deleteActiveFile} title="Delete">🗑</button>
                    <button class="success run-btn" onclick={handleCompileRun} disabled={isUploading || !isConnected}>
                        {isUploading ? `${uploadProgress}%` : '▶ RUN'}
                    </button>
                </div>
            </div>
            <div class="code-container">
                <Editor 
                    value={activeFile.content} 
                    onchange={(val) => {
                        storage.updateFile(activeFileId, { content: val });
                        files = storage.getFiles();
                    }}
                />
            </div>
        {:else}
            <div class="empty-state">
                <h2>No File Selected</h2>
                <p>Select a file from the explorer or create a new one.</p>
                <button onclick={createNewFile}>Create File</button>
            </div>
        {/if}
    </section>

    <!-- Tools Sidebar -->
    <aside class="sidebar tools">
        <div class="panel-header">DASHBOARD</div>
        
        <div class="sidebar-section">
            <div class="section-header">HUB STATUS (ALL FLAGS)</div>
            <div class="info-row">
                <span>Program ID: {runningProgId}</span>
                <span>Slot: {selectedSlot}</span>
            </div>
            <div class="flags-grid">
                <div class="flag-item" class:on={flags.userProgramRunning}>
                    <span class="dot"></span> Running
                </div>
                <div class="flag-item" class:on={flags.powerButtonPressed}>
                    <span class="dot"></span> Power Btn
                </div>
                <div class="flag-item warning" class:on={flags.batteryLowVoltageWarning}>
                    <span class="dot"></span> Low Battery
                </div>
                <div class="flag-item critical" class:on={flags.batteryLowVoltageShutdown}>
                    <span class="dot"></span> Crit Battery
                </div>
                <div class="flag-item critical" class:on={flags.batteryHighCurrent}>
                    <span class="dot"></span> High Current
                </div>
                <div class="flag-item" class:on={flags.bleAdvertising}>
                    <span class="dot"></span> Advertising
                </div>
                <div class="flag-item warning" class:on={flags.bleLowSignal}>
                    <span class="dot"></span> Low Signal
                </div>
                <div class="flag-item" class:on={flags.shutdown}>
                    <span class="dot"></span> Shutdown
                </div>
            </div>
        </div>

        <div class="sidebar-section">
            <div class="section-header">CAPABILITIES</div>
            <div class="flags-grid">
                <div class="flag-item" class:on={capabilities.hasRepl}><span class="dot"></span> REPL</div>
                <div class="flag-item" class:on={capabilities.hasPortView}><span class="dot"></span> Port View</div>
                <div class="flag-item" class:on={capabilities.hasImuCalibration}><span class="dot"></span> IMU Calib</div>
                <div class="flag-item" class:on={capabilities.userProgramMultiMpy6}><span class="dot"></span> MPY6</div>
                <div class="flag-item" class:on={capabilities.userProgramMultiMpy6Native6p1}><span class="dot"></span> Native</div>
            </div>
        </div>

        {#if isConnected}
            <div class="sidebar-section">
                <div class="section-header">COMMANDS</div>
                <div class="grid-2">
                    <button class="secondary small" onclick={startRepl}>REPL</button>
                    <button class="secondary small" onclick={startPortView}>Ports</button>
                    <button class="secondary small" onclick={startImuCalibration}>IMU</button>
                    <button class="danger-outline small" onclick={resetInUpdateMode}>DFU Mode</button>
                </div>
            </div>

            <div class="sidebar-section">
                <div class="section-header">INTERACTION</div>
                <div class="tool-input">
                    <span class="label">STDIN</span>
                    <input type="text" bind:value={stdinInput} placeholder="Send text..." onkeydown={e => e.key === 'Enter' && handleSendStdin()}>
                </div>
                <div class="tool-input">
                    <span class="label">APPDATA (Hex)</span>
                    <div class="row">
                        <input type="number" bind:value={appDataOffset} placeholder="Offset" class="offs">
                        <input type="text" bind:value={appDataPayload} placeholder="01 AA FF">
                    </div>
                    <button class="secondary small full" onclick={handleSendAppData}>Write Bytes</button>
                </div>
            </div>
        {/if}
    </aside>
  </div>

  <footer class="bottom-area">
    <div class="panel-tabs">
        <button class:active={activeTab === 'terminal'} onclick={() => activeTab = 'terminal'}>TERMINAL</button>
        <button class:active={activeTab === 'appdata'} onclick={() => activeTab = 'appdata'}>APP DATA</button>
        <button class:active={activeTab === 'debug'} onclick={() => activeTab = 'debug'}>DEBUG LOG</button>
        <div class="spacer"></div>
        <button class="clear-btn" onclick={() => {
            if(activeTab === 'terminal') terminalOutput = '';
            if(activeTab === 'appdata') appDataLogs = [];
            if(activeTab === 'debug') logs = [];
        }}>Clear</button>
    </div>
    <div class="panel-content">
        {#if activeTab === 'terminal'}<pre class="terminal">{terminalOutput || 'Terminal output will appear here...'}</pre>{/if}
        {#if activeTab === 'appdata'}
            <div class="log-view">{#each appDataLogs as log}<div>{log}</div>{/each}</div>
        {/if}
        {#if activeTab === 'debug'}
            <div class="log-view">{#each logs as log}<div>{log}</div>{/each}</div>
        {/if}
    </div>
  </footer>
</main>

<style>
  :root {
    --bg-dark: #181818;
    --bg-panel: #252526;
    --bg-nav: #323233;
    --border: #3c3c3c;
    --accent: #0e639c;
    --text: #cccccc;
    --text-bright: #ffffff;
    --danger: #f14c4c;
    --success: #388a34;
    --warning: #cca700;
  }

  :global(body) { 
    background: var(--bg-dark); color: var(--text); font-family: 'Segoe UI', system-ui, sans-serif;
    margin: 0; padding: 0; height: 100vh; width: 100vw; overflow: hidden;
  }

  .app-container { display: flex; flex-direction: column; height: 100vh; width: 100vw; }

  /* Navigation */
  .top-nav { 
    height: 35px; background: var(--bg-nav); border-bottom: 1px solid var(--border);
    display: flex; align-items: center; padding: 0 12px; gap: 15px; font-size: 12px; flex-shrink: 0;
  }
  .brand { font-weight: bold; color: var(--text-bright); }
  .brand span { color: var(--accent); }
  .hub-info { display: flex; align-items: center; gap: 10px; }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; background: #555; }
  .status-dot.connected { background: var(--success); box-shadow: 0 0 5px var(--success); }
  .v-divider { width: 1px; height: 16px; background: var(--border); }
  
  .battery-pill, .running-pill { padding: 1px 6px; border-radius: 10px; font-size: 9px; font-weight: bold; background: #444; }
  .battery-pill.low { color: var(--warning); border: 1px solid var(--warning); }
  .battery-pill.critical { color: var(--danger); border: 1px solid var(--danger); }
  .running-pill { background: var(--success); color: white; }

  .nav-actions { margin-left: auto; display: flex; gap: 8px; }

  /* Workbench */
  .workbench { flex: 1; display: flex; min-height: 0; width: 100%; }

  .sidebar { width: 260px; background: var(--bg-panel); border-right: 1px solid var(--border); display: flex; flex-direction: column; flex-shrink: 0; }
  .sidebar.tools { border-right: none; border-left: 1px solid var(--border); }
  
  .panel-header { padding: 8px 12px; font-size: 11px; font-weight: bold; color: #888; background: rgba(0,0,0,0.1); }
  
  .sidebar-section { border-bottom: 1px solid var(--border); }
  .section-header { padding: 6px 12px; font-size: 11px; font-weight: bold; display: flex; justify-content: space-between; align-items: center; color: #777; }
  
  .list { display: flex; flex-direction: column; }
  .item-row { display: flex; align-items: center; width: 100%; padding-right: 8px; }
  .item-row:hover { background: #2a2d2e; }
  .item { 
    flex: 1; text-align: left; background: transparent; border: none; padding: 4px 20px;
    color: var(--text); font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 8px;
  }
  .item:hover { background: transparent; }
  .item.active { background: #37373d; color: white; }
  .item.example { color: #888; font-style: italic; }
  .icon { font-family: monospace; font-size: 10px; border: 1px solid; padding: 0 2px; border-radius: 2px; line-height: 1; }

  .icon-btn { background: transparent; border: none; padding: 2px 6px; font-size: 14px; opacity: 0.6; }
  .icon-btn:hover { opacity: 1; background: #333; }
  .icon-btn.small-play { font-size: 10px; color: var(--success); opacity: 0.7; }
  .icon-btn.small-play:hover { opacity: 1; background: #333; }

  /* Editor */
  .editor-main { flex: 1; display: flex; flex-direction: column; min-width: 0; background: var(--bg-dark); }
  .toolbar { height: 35px; background: var(--bg-panel); display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border); padding: 0 10px; }
  .tabs { display: flex; height: 100%; }
  .tab { padding: 0 20px; display: flex; align-items: center; font-size: 12px; background: var(--bg-dark); border-right: 1px solid var(--border); }
  .code-container { flex: 1; min-height: 0; position: relative; }
  
  /* Dashboard Grid */
  .flags-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 8px 12px; }
  .flag-item { font-size: 10px; background: #333; padding: 4px 6px; border-radius: 3px; display: flex; align-items: center; gap: 6px; opacity: 0.4; }
  .flag-item.on { opacity: 1; background: #444; }
  .flag-item .dot { width: 6px; height: 6px; border-radius: 50%; background: #555; }
  .flag-item.on .dot { background: var(--accent); box-shadow: 0 0 3px var(--accent); }
  .flag-item.on.warning { color: var(--warning); }
  .flag-item.on.critical { color: var(--danger); font-weight: bold; }
  
  .info-row { padding: 4px 12px; font-size: 11px; color: #888; display: flex; gap: 10px; }

  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 10px 12px; }
  .tool-input { padding: 8px 12px; display: flex; flex-direction: column; gap: 4px; }
  .tool-input .label { font-size: 10px; color: #666; }
  .tool-input .row { display: flex; gap: 4px; }
  .tool-input .offs { width: 60px; flex-shrink: 0; }

  /* Footer */
  .bottom-area { height: 200px; background: var(--bg-dark); border-top: 1px solid var(--border); display: flex; flex-direction: column; flex-shrink: 0; }
  .panel-tabs { height: 30px; background: var(--bg-panel); display: flex; align-items: center; padding: 0 12px; gap: 20px; }
  .panel-tabs button { background: transparent; border: none; color: #777; font-size: 11px; cursor: pointer; padding: 5px 0; border-bottom: 2px solid transparent; }
  .panel-tabs button.active { color: white; border-bottom-color: var(--accent); }
  .panel-content { flex: 1; overflow-y: auto; padding: 10px; background: #0a0a0a; }
  .terminal { color: #00ff00; font-family: monospace; font-size: 12px; margin: 0; white-space: pre-wrap; }
  .log-view { font-family: monospace; font-size: 11px; color: #888; }
  .spacer { flex: 1; }

  /* Buttons & Inputs */
  button { background: #3a3d41; color: white; border: 1px solid #444; padding: 4px 10px; border-radius: 2px; font-size: 12px; cursor: pointer; transition: 0.15s; }
  button:hover:not(:disabled) { background: #454d5d; }
  button.primary { background: var(--accent); border: none; }
  button.success { background: var(--success); border: none; }
  button.danger { background: var(--danger); border: none; }
  button.danger-outline { background: transparent; color: var(--danger); border-color: var(--danger); }
  button.small { padding: 2px 6px; font-size: 11px; }
  button.full { width: 100%; }
  button:disabled { opacity: 0.5; cursor: default; }

  input { background: #3c3c3c; border: 1px solid #444; color: white; padding: 4px 8px; border-radius: 2px; font-size: 12px; outline: none; width: 100%; box-sizing: border-box; }
  input:focus { border-color: var(--accent); }

  .clear-btn { opacity: 0.5; font-size: 10px; }
  .empty-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; opacity: 0.3; }
</style>
