import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.mjs";
import { 
    MSG_INIT, MSG_INIT_COMPLETE, MSG_INIT_FAIL,
    MSG_COMPLETE, MSG_COMPLETE_RESULT, MSG_COMPLETE_FAIL,
    MSG_CHECK, MSG_CHECK_RESULT
} from './python-message.js';

let pyodide = null;

const pybricksStubs = `
# Basic Pybricks Stubs for Autocompletion
class Hub:
    def __init__(self):
        pass

class PrimeHub(Hub):
    def __init__(self):
        self.battery = Battery()
        self.light = ColorLight()
        self.buttons = Buttons()
        self.speaker = Speaker()
        self.display = Display()
        self.imu = IMU()
        self.system = System()

class InventorHub(PrimeHub): pass
class EssentialHub(Hub): pass
class TechnicHub(Hub): pass
class CityHub(Hub): pass
class MoveHub(Hub): pass
class EV3Brick(Hub): pass

class Motor:
    def __init__(self, port, positive_direction=None, gears=None):
        pass
    def run(self, speed):
        pass
    def stop(self):
        pass
    def run_time(self, speed, time, then=None, wait=True):
        pass
    def run_angle(self, speed, rotation_angle, then=None, wait=True):
        pass
    def run_target(self, speed, target_angle, then=None, wait=True):
        pass
    def dc(self, duty):
        pass
    def angle(self):
        return 0
    def speed(self):
        return 0
    def reset_angle(self, angle=None):
        pass

class DCMotor:
    def __init__(self, port, positive_direction=None, gears=None):
        pass
    def dc(self, duty):
        pass
    def stop(self):
        pass

class ColorSensor:
    def __init__(self, port):
        pass
    def color(self):
        return None
    def reflection(self):
        return 0
    def ambient(self):
        return 0

class UltrasonicSensor:
    def __init__(self, port):
        pass
    def distance(self):
        return 0
    def presence(self):
        return False

class ForceSensor:
    def __init__(self, port):
        pass
    def force(self):
        return 0
    def pressed(self):
        return False
    def touched(self):
        return False

class Battery:
    def voltage(self):
        return 0
    def current(self):
        return 0

class ColorLight:
    def on(self, color):
        pass
    def off(self):
        pass
    def blink(self, color, durations):
        pass
    def animate(self, cells, interval):
        pass

class Buttons:
    def pressed(self):
        return []

class Speaker:
    def beep(self, frequency=500, duration=100):
        pass
    def play_notes(self, notes, tempo=120):
        pass
    def volume(self, volume):
        pass

class Display:
    def image(self, image):
        pass
    def pixel(self, row, column, brightness=100):
        pass
    def off(self):
        pass

class IMU:
    def tilt(self):
        return (0, 0)
    def acceleration(self):
        return (0, 0, 0)
    def angular_velocity(self):
        return (0, 0, 0)
    def heading(self):
        return 0
    def reset_heading(self, angle):
        pass

class System:
    def set_stop_button(self, button):
        pass
    def name(self):
        return ""
    def storage(self, offset, write=None):
        return b""
    def shutdown(self):
        pass

class StopWatch:
    def time(self):
        return 0
    def pause(self):
        pass
    def resume(self):
        pass
    def reset(self):
        pass

class DriveBase:
    def __init__(self, left_motor, right_motor, wheel_diameter, axle_track):
        pass
    def drive(self, speed, turn_rate):
        pass
    def straight(self, distance):
        pass
    def turn(self, angle):
        pass
    def curve(self, radius, angle):
        pass
    def settings(self, straight_speed, straight_acceleration, turn_rate, turn_acceleration):
        pass
    def distance(self):
        return 0
    def angle(self):
        return 0
    def reset(self):
        pass

def wait(time):
    pass

class Port:
    A = "A"
    B = "B"
    C = "C"
    D = "D"
    E = "E"
    F = "F"

class Direction:
    CLOCKWISE = 0
    COUNTERCLOCKWISE = 1

class Stop:
    COAST = 0
    BRAKE = 1
    HOLD = 2

class Color:
    RED = "RED"
    GREEN = "GREEN"
    BLUE = "BLUE"
    YELLOW = "YELLOW"
    MAGENTA = "MAGENTA"
    ORANGE = "ORANGE"
    CYAN = "CYAN"
    BLACK = "BLACK"
    WHITE = "WHITE"
    NONE = None

class Button:
    LEFT = "LEFT"
    RIGHT = "RIGHT"
    CENTER = "CENTER"
    UP = "UP"
    DOWN = "DOWN"
    BLUETOOTH = "BLUETOOTH"

class Side:
    TOP = "TOP"
    BOTTOM = "BOTTOM"
    LEFT = "LEFT"
    RIGHT = "RIGHT"
    FRONT = "FRONT"
    BACK = "BACK"
`;

// Helper to set up the environment
async function setupEnvironment() {
    // 1. Create pybricks package structure
    pyodide.FS.mkdir('/pybricks');
    pyodide.FS.writeFile('/pybricks/__init__.py', '');
    
    // 2. Create submodules
    pyodide.FS.writeFile('/_pybricks_stubs.py', pybricksStubs);

    pyodide.FS.writeFile('/pybricks/hubs.py', 'from _pybricks_stubs import Hub, PrimeHub, InventorHub, EssentialHub, TechnicHub, CityHub, MoveHub, EV3Brick');
    pyodide.FS.writeFile('/pybricks/pupdevices.py', 'from _pybricks_stubs import Motor, DCMotor, ColorSensor, UltrasonicSensor, ForceSensor, ColorLight');
    pyodide.FS.writeFile('/pybricks/parameters.py', 'from _pybricks_stubs import Port, Direction, Stop, Color, Button, Side');
    pyodide.FS.writeFile('/pybricks/tools.py', 'from _pybricks_stubs import wait, StopWatch');
    pyodide.FS.writeFile('/pybricks/robotics.py', 'from _pybricks_stubs import DriveBase');
}

self.onmessage = async (e) => {
    const { type, id, code, line, column } = e.data;

    if (type === MSG_INIT) {
        try {
            console.log("Loading Pyodide...");
            pyodide = await loadPyodide({
                indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/"
            });

            console.log("Installing Jedi...");
            await pyodide.loadPackage('micropip');
            const micropip = pyodide.pyimport('micropip');
            await micropip.install('jedi');
            
            console.log("Setting up Pybricks stubs...");
            await setupEnvironment();
            await pyodide.runPythonAsync("import sys; sys.path.append('/')");

            console.log("Pyodide Ready.");
            self.postMessage({ type: MSG_INIT_COMPLETE });
        } catch (err) {
            console.error(err);
            self.postMessage({ type: MSG_INIT_FAIL, error: err.toString() });
        }
    } 
    else if (type === MSG_COMPLETE) {
        if (!pyodide) return;
        console.log("Worker computing completions for line", line, "col", column);
        try {
            // Write to file first
            pyodide.FS.writeFile('/main.py', code);
            
            // Pass parameters via globals to avoid string injection risks
            pyodide.globals.set("line_no", line);
            pyodide.globals.set("col_no", column);
            
            const pythonCode = `
import jedi
import sys

# Ensure output is initialized
output = []

try:
    with open('/main.py', 'r') as f:
        source = f.read()
    
    script = jedi.Script(code=source, path='/main.py')
    completions = script.complete(line_no, col_no)
    
    result_list = []
    for c in completions:
        kind = 0
        if c.type == 'class': kind = 6
        elif c.type == 'function': kind = 1
        elif c.type == 'module': kind = 8
        elif c.type == 'keyword': kind = 13
        
        result_list.append({
            "label": c.name,
            "kind": kind, 
            "detail": c.description,
            "documentation": c.docstring()
        })
    output = result_list
except Exception as e:
    output = str(e)
`;
            await pyodide.runPythonAsync(pythonCode);
            const results = pyodide.globals.get("output");
            console.log("Jedi Results", results);
            
            if (typeof results === 'string') {
                console.error("Jedi Error:", results);
                self.postMessage({ type: MSG_COMPLETE_FAIL, id, error: results });
            } else if (results && typeof results.toJs === 'function') {
                const jsResults = results.toJs();
                results.destroy(); // Free the PyProxy
                
                // Convert Map objects to plain Objects if necessary
                const finalResults = jsResults.map(item => {
                    return (item instanceof Map) ? Object.fromEntries(item) : item;
                });
                
                self.postMessage({ type: MSG_COMPLETE_RESULT, id, results: finalResults });
            } else {
                // If results is undefined or something unexpected
                self.postMessage({ type: MSG_COMPLETE_RESULT, id, results: [] });
            }
        } catch (err) {
            console.error("Worker Exception:", err);
            self.postMessage({ type: MSG_COMPLETE_FAIL, id, error: err.toString() });
        }
    }
    else if (type === MSG_CHECK) {
        if (!pyodide) return;
        try {
            pyodide.FS.writeFile('/main.py', code);
            const checkCodeSafe = `
import sys
try:
    with open('/main.py', 'r') as f:
        source = f.read()
    compile(source, 'main.py', 'exec')
    None
except SyntaxError as e:
    { "line": e.lineno, "column": e.offset, "message": e.msg }
except Exception as e:
    { "line": 1, "column": 1, "message": str(e) }
`;
            const result = await pyodide.runPythonAsync(checkCodeSafe);
            let error = null;
            if (result) {
                error = result.toJs({dict_converter: Object.fromEntries});
                result.destroy();
            }
            self.postMessage({ type: MSG_CHECK_RESULT, id, error });
        } catch (err) {
             self.postMessage({ type: MSG_CHECK_RESULT, id, error: { line: 1, message: err.toString() } });
        }
    }
};
