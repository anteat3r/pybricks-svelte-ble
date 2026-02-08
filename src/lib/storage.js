
const STORAGE_KEY = 'pybricks_files';

export function getFiles() {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
}

export function saveFiles(files) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
}

export function createFile(name, content = '') {
    const files = getFiles();
    const newFile = {
        id: crypto.randomUUID(),
        name,
        content,
        updatedAt: Date.now()
    };
    files.push(newFile);
    saveFiles(files);
    return newFile;
}

export function updateFile(id, updates) {
    const files = getFiles();
    const index = files.findIndex(f => f.id === id);
    if (index !== -1) {
        files[index] = { ...files[index], ...updates, updatedAt: Date.now() };
        saveFiles(files);
        return files[index];
    }
    return null;
}

export function deleteFile(id) {
    const files = getFiles().filter(f => f.id !== id);
    saveFiles(files);
}

export function renameFile(id, newName) {
    return updateFile(id, { name: newName });
}
