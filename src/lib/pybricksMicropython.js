import * as monaco from 'monaco-editor';

/** The Pybricks MicroPython language identifier. */
export const pybricksMicroPythonId = 'pybricks-micropython';

export const conf = {
    comments: {
        lineComment: '#',
        blockComment: ["'''", "'''"],
    },
    brackets: [
        ['{', '}'],
        ['[', ']'],
        ['(', ')'],
    ],
    autoClosingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"', notIn: ['string'] },
        { open: "'", close: "'", notIn: ['string', 'comment'] },
    ],
    surroundingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
        { open: "'", close: "'" },
    ],
};

export const language = {
    defaultToken: '',
    tokenPostfix: '.python',

    keywords: [
        'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class',
        'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global',
        'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise',
        'return', 'try', 'while', 'with', 'yield',
    ],

    builtins: [
        'abs', 'all', 'any', 'ascii', 'bin', 'bool', 'breakpoint', 'bytearray', 'bytes',
        'callable', 'chr', 'classmethod', 'compile', 'complex', 'delattr', 'dict', 'dir',
        'divmod', 'enumerate', 'eval', 'exec', 'filter', 'float', 'format', 'frozenset',
        'getattr', 'globals', 'hasattr', 'hash', 'help', 'hex', 'id', 'input', 'int',
        'isinstance', 'issubclass', 'iter', 'len', 'list', 'locals', 'map', 'max',
        'memoryview', 'min', 'next', 'object', 'oct', 'open', 'ord', 'pow', 'print',
        'property', 'reversed', 'range', 'repr', 'reversed', 'round', 'self', 'set',
        'setattr', 'slice', 'sorted', 'staticmethod', 'str', 'sum', 'super', 'tuple',
        'type', 'vars', 'zip', '__import__',
    ],

    brackets: [
        { open: '{', close: '}', token: 'delimiter.curly' },
        { open: '[', close: ']', token: 'delimiter.bracket' },
        { open: '(', close: ')', token: 'delimiter.parenthesis' },
    ],

    tokenizer: {
        root: [
            { include: '@whitespace' },
            [/[a-zA-Z_]\w*/, {
                cases: {
                    '@keywords': 'keyword',
                    '@builtins': 'support.function',
                    '@default': 'identifier'
                }
            }],
            [ /\d+/, 'number' ],
            [ /"/, 'string', '@string_double' ],
            [ /'/, 'string', '@string_single' ]
        ],

        whitespace: [
            [ /\s+/, 'white' ],
            [/(^#.*$)/, 'comment'],
        ],
        
        string_double: [
            [/[^\\\"]+/, 'string'],
            [/\\./, 'string.escape'],
            [/"/, 'string', '@pop']
        ],
        
        string_single: [
            [/[^\\']+/, 'string'],
            [/\\./, 'string.escape'],
            [/'/, 'string', '@pop']
        ]
    },
};

function createTemplate(hubClassName, deviceClassNames) {
    return `from pybricks.hubs import ${hubClassName}
from pybricks.${ 
        hubClassName === 'EV3Brick' ? 'ev3devices' : 'pupdevices'
    } import ${deviceClassNames.join(', ')}
from pybricks.parameters import Button, Color, Direction, Port, Side, Stop
from pybricks.robotics import DriveBase
from pybricks.tools import wait, StopWatch

hub = ${hubClassName}()

`;
}

const templateSnippets = [
    {
        label: 'technichub',
        documentation: 'Template for Technic hub program.',
        insertText: createTemplate('TechnicHub', ['Motor']),
    },
    {
        label: 'cityhub',
        documentation: 'Template for City hub program.',
        insertText: createTemplate('CityHub', ['DCMotor', 'Light']),
    },
    {
        label: 'movehub',
        documentation: 'Template for BOOST Move hub program.',
        insertText: createTemplate('MoveHub', ['Motor', 'ColorDistanceSensor']),
    },
    {
        label: 'inventorhub',
        documentation: 'Template for MINDSTORMS Robot Inventor hub program.',
        insertText: createTemplate('InventorHub', [
            'Motor',
            'ColorSensor',
            'UltrasonicSensor',
        ]),
    },
    {
        label: 'primehub',
        documentation: 'Template for SPIKE Prime program.',
        insertText: createTemplate('PrimeHub', [
            'Motor',
            'ColorSensor',
            'UltrasonicSensor',
            'ForceSensor',
        ]),
    },
    {
        label: 'essentialhub',
        documentation: 'Template for SPIKE Essential program.',
        insertText: createTemplate('EssentialHub', [
            'Motor',
            'ColorSensor',
            'ColorLightMatrix',
        ]),
    },
    {
        label: 'ev3',
        documentation: 'Template for MINDSTORMS EV3 program.',
        insertText: createTemplate('EV3Brick', [
            'Motor',
            'ColorSensor',
            'GyroSensor',
            'InfraredSensor',
            'TouchSensor',
            'UltrasonicSensor',
        ]),
    },
];

export const templateSnippetCompletions = {
    provideCompletionItems: (model, position, _context, _token) => {
        // templates snippets are only available on the first line
        if (position.lineNumber !== 1) {
            return undefined;
        }

        const range = {
            startLineNumber: position.lineNumber,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
        };

        const textUntilPosition = model.getValueInRange(range);

        const items = templateSnippets
            .filter((x) => x.label.startsWith(textUntilPosition))
            .map((x) => ({
                detail: x.insertText,
                kind: monaco.languages.CompletionItemKind.Snippet,
                range,
                ...x,
            }));

        if (!items) {
            return undefined;
        }

        return { suggestions: items };
    },
};
