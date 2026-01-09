import { getCurrentWindow } from '@tauri-apps/api/window';

export interface FileDropEvent {
  paths: string[];
}

/**
 * Set up Tauri file drop handler for H5/HDF5 files
 * @param onFileDrop Callback function that receives the dropped file path
 */
export async function setupFileDropHandler(onFileDrop: (filePath: string) => void) {
  // Check if running in Tauri
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    const appWindow = getCurrentWindow();
    
    // Listen for file drop events using the window API
    await appWindow.onDragDropEvent((event) => {
      console.log('Drag drop event:', event);
      
      if (event.payload.type === 'drop') {
        const paths = event.payload.paths;
        console.log('Dropped files:', paths);
        
        // Filter for HDF5 files
        const h5Files = paths.filter((path) => {
          const ext = path.toLowerCase();
          return ext.endsWith('.h5') || ext.endsWith('.hdf5') || ext.endsWith('.hdf');
        });

        console.log('H5 files found:', h5Files);
        
        // Load the first H5 file if any
        if (h5Files.length > 0) {
          onFileDrop(h5Files[0]);
        }
      }
    });
    
    console.log('File drop handler set up successfully');
  }
}

/**
 * Check if the app is running in Tauri
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
