import { getCurrentWindow } from '@tauri-apps/api/window';

export interface FileDropEvent {
  paths: string[];
}

/**
 * Set up Tauri file drop handler for H5/HDF5 files
 * Note: This is now deprecated since we use browser-native drag-and-drop
 * (dragDropEnabled: false in tauri.conf.json)
 */
export async function setupFileDropHandler(_onFileDrop: (filePath: string) => void) {
  // Tauri drag-and-drop is disabled - browser handles it natively
  // This gives us proper File objects that work with large files
  console.log('[tauri-utils] Drag-and-drop handled by browser natively');
}

/**
 * Get the directory path from a full file path
 */
export function getDirectoryPath(filePath: string): string {
  // Handle both Windows and Unix paths
  const lastBackslash = filePath.lastIndexOf('\\');
  const lastForwardSlash = filePath.lastIndexOf('/');
  const lastSep = Math.max(lastBackslash, lastForwardSlash);
  
  return lastSep > 0 ? filePath.substring(0, lastSep) : filePath;
}

/**
 * Get the filename from a full file path
 */
export function getFileName(filePath: string): string {
  const lastBackslash = filePath.lastIndexOf('\\');
  const lastForwardSlash = filePath.lastIndexOf('/');
  const lastSep = Math.max(lastBackslash, lastForwardSlash);
  
  return lastSep >= 0 ? filePath.substring(lastSep + 1) : filePath;
}

/**
 * Set up handler for when the app is opened with a file (double-click association)
 * Returns the file path that was passed to the app, if any
 */
export async function getInitialFilePath(): Promise<string | null> {
  // Check if running in Tauri
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const filePath = await invoke<string | null>('get_initial_file');
      
      if (filePath) {
        const ext = filePath.toLowerCase();
        if (ext.endsWith('.h5') || ext.endsWith('.hdf5') || ext.endsWith('.hdf') ||
            ext.endsWith('.nxs') || ext.endsWith('.nx') || ext.endsWith('.nexus')) {
          return filePath;
        }
      }
    } catch (error) {
      console.error('[tauri-utils] Error getting initial file:', error);
    }
  }
  return null;
}

/**
 * Set up handler for when the app is opened with a file (double-click association)
 * @deprecated Use getInitialFilePath() instead
 */
export async function setupFileOpenHandler(onFileOpen: (filePath: string) => void) {
  const filePath = await getInitialFilePath();
  if (filePath) {
    onFileOpen(filePath);
  }
}

/**
 * Open Windows File Explorer with the file pre-selected using /select
 * This provides native Windows file selection experience
 */
export async function showFileInExplorer(filePath: string): Promise<void> {
  if (!isTauri()) return;
  
  try {
    const { Command } = await import('@tauri-apps/plugin-shell');
    // Use explorer.exe /select to open Explorer with the file selected
    await Command.create('explorer', ['/select,', filePath]).execute();
  } catch (error) {
    console.error('[tauri-utils] Error showing file in Explorer:', error);
  }
}

/**
 * Open a native file dialog pre-navigated to a specific directory or with a file pre-selected
 * If filePath is provided, the dialog will try to open in that file's directory with the filename pre-filled
 * Returns the selected file path, or null if cancelled
 */
export async function openNativeFileDialog(filePath?: string): Promise<string | null> {
  if (!isTauri()) return null;
  
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    
    // Use the full file path as defaultPath - this should:
    // 1. Navigate to the file's directory
    // 2. Pre-fill the filename in the dialog
    console.log('[tauri-utils] Opening dialog with defaultPath:', filePath);
    
    const result = await open({
      title: 'Select HDF5 file',
      defaultPath: filePath, // Use full file path, not just directory
      filters: [{
        name: 'HDF5 Files',
        extensions: ['h5', 'hdf5', 'hdf', 'nxs', 'nx', 'nexus']
      }],
      multiple: false,
      directory: false,
    });
    
    if (result && typeof result === 'string') {
      return result;
    }
    
    return null;
  } catch (error) {
    console.error('[tauri-utils] Error opening file dialog:', error);
    return null;
  }
}

/**
 * Get file metadata (size) using Tauri FS
 */
export async function getFileSize(filePath: string): Promise<number | null> {
  if (!isTauri()) return null;
  
  try {
    const { stat } = await import('@tauri-apps/plugin-fs');
    const metadata = await stat(filePath);
    return metadata.size;
  } catch (error) {
    console.error('[tauri-utils] Error getting file size:', error);
    return null;
  }
}

/**
 * Read a file as ArrayBuffer using Tauri FS
 * WARNING: This loads the entire file into memory!
 * Only use for files under the size limit.
 */
export async function readFileAsBuffer(filePath: string): Promise<ArrayBuffer | null> {
  if (!isTauri()) return null;
  
  try {
    const { readFile } = await import('@tauri-apps/plugin-fs');
    const data = await readFile(filePath);
    return data.buffer as ArrayBuffer;
  } catch (error) {
    console.error('[tauri-utils] Error reading file:', error);
    return null;
  }
}

/**
 * Check if the app is running in Tauri
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
