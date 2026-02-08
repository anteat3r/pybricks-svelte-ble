<script>
    import { onMount, onDestroy } from 'svelte';
    import * as monaco from 'monaco-editor';
    import { 
        pybricksMicroPythonId, 
        conf, 
        language, 
        templateSnippetCompletions 
    } from './pybricksMicropython';
    import { 
        MSG_INIT, MSG_INIT_COMPLETE, 
        MSG_COMPLETE, MSG_COMPLETE_RESULT,
        MSG_CHECK, MSG_CHECK_RESULT 
    } from './python-message';

    // Props
    let { value = '', onchange } = $props();

    let editorContainer;
    let editor;
    let worker;
    let workerReady = false;
    let completionRequestId = 0;
    let pendingCompletions = new Map();

    // Register language globally once
    if (!monaco.languages.getLanguages().some(l => l.id === pybricksMicroPythonId)) {
        monaco.languages.register({ id: pybricksMicroPythonId });
        monaco.languages.setLanguageConfiguration(pybricksMicroPythonId, conf);
        monaco.languages.setMonarchTokensProvider(pybricksMicroPythonId, language);
        monaco.languages.registerCompletionItemProvider(pybricksMicroPythonId, templateSnippetCompletions);
        
        // Dynamic Completion Provider backed by Worker
        monaco.languages.registerCompletionItemProvider(pybricksMicroPythonId, {
            triggerCharacters: ['.'],
            provideCompletionItems: async (model, position) => {
                if (!worker || !workerReady) return { suggestions: [] };

                const text = model.getValue();
                const reqId = completionRequestId++;
                
                return new Promise((resolve) => {
                    pendingCompletions.set(reqId, resolve);
                    worker.postMessage({
                        type: MSG_COMPLETE,
                        id: reqId,
                        code: text,
                        line: position.lineNumber,
                        column: position.column - 1 // Jedi is 0-indexed for columns usually? Or maybe 0?
                    });
                    
                    // Timeout fallback
                    setTimeout(() => {
                        if (pendingCompletions.has(reqId)) {
                            pendingCompletions.delete(reqId);
                            resolve({ suggestions: [] });
                        }
                    }, 2000);
                });
            }
        });
    }

    onMount(() => {
        // Initialize Worker
        worker = new Worker(new URL('./python-worker.js', import.meta.url), { type: 'module' });
        
        worker.onmessage = (e) => {
            const { type, id, results, error } = e.data;
            
            if (type === MSG_INIT_COMPLETE) {
                workerReady = true;
                console.log("Python Worker Ready");
                checkSyntax(); // Check initial code
            } 
            else if (type === MSG_COMPLETE_RESULT) {
                if (pendingCompletions.has(id)) {
                    const resolve = pendingCompletions.get(id);
                    
                    // Map Jedi results to Monaco
                    const suggestions = results.map(r => {
                        // Sort dunder methods (__init__, etc.) to the bottom
                        const isDunder = r.label.startsWith('__');
                        const sortText = isDunder ? 'zz' + r.label : r.label;
                        
                        return {
                            label: r.label,
                            kind: mapJediKindToMonaco(r.kind),
                            insertText: r.label,
                            detail: r.detail,
                            documentation: r.documentation,
                            sortText: sortText
                        };
                    });
                    
                    resolve({ suggestions });
                    pendingCompletions.delete(id);
                }
            }
            else if (type === MSG_CHECK_RESULT) {
                 const model = editor.getModel();
                 if (model) {
                     if (error) {
                         monaco.editor.setModelMarkers(model, 'python', [{
                             startLineNumber: error.line,
                             startColumn: error.column || 1,
                             endLineNumber: error.line,
                             endColumn: 1000,
                             message: error.message,
                             severity: monaco.MarkerSeverity.Error
                         }]);
                     } else {
                         monaco.editor.setModelMarkers(model, 'python', []);
                     }
                 }
            }
        };

        worker.postMessage({ type: MSG_INIT });

        editor = monaco.editor.create(editorContainer, {
            value: value,
            language: pybricksMicroPythonId,
            theme: 'vs-dark',
            automaticLayout: true,
            fontSize: 14,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            lineNumbersMinChars: 4,
            folding: true,
            tabSize: 4,
            insertSpaces: true,
            padding: { top: 10, bottom: 10 },
            fontFamily: "'Consolas', 'Courier New', monospace",
            wordBasedSuggestions: 'off',
            quickSuggestions: { other: true, comments: false, strings: false },
            suggest: {
                filterGraceful: true,
                snippetsPreventQuickSuggestions: false,
            }
        });

        editor.onDidChangeModelContent(() => {
            const val = editor.getValue();
            if (onchange) onchange(val);
            checkSyntax();
        });
    });

    function checkSyntax() {
        if (!worker || !workerReady || !editor) return;
        worker.postMessage({
            type: MSG_CHECK,
            code: editor.getValue()
        });
    }

    function mapJediKindToMonaco(kind) {
        // Simple mapping
        // 1: Function, 6: Class, 8: Module, 13: Keyword
        // Monaco: Function=1, Class=6, Module=8, Keyword=13 (Actually enum values differ)
        switch(kind) {
            case 6: return monaco.languages.CompletionItemKind.Class;
            case 1: return monaco.languages.CompletionItemKind.Function;
            case 8: return monaco.languages.CompletionItemKind.Module;
            case 13: return monaco.languages.CompletionItemKind.Keyword;
            default: return monaco.languages.CompletionItemKind.Property;
        }
    }

    onDestroy(() => {
        if (editor) editor.dispose();
        if (worker) worker.terminate();
    });

    $effect(() => {
        if (editor && value !== editor.getValue()) {
            const current = editor.getValue();
            if (value !== current) {
                editor.setValue(value);
            }
        }
    });
</script>

<div class="editor-wrapper" bind:this={editorContainer}></div>

<style>
    .editor-wrapper {
        width: 100%;
        height: 100%;
        overflow: hidden;
    }
</style>
