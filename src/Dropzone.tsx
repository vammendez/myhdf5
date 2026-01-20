import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';

import styles from './Dropzone.module.css';
import { FileService, type LocalFile, useStore } from './stores';
import { 
  getFileName, 
  getFileSize,
  getInitialFilePath, 
  isTauri, 
  openNativeFileDialog,
  readFileAsBuffer,
  showFileInExplorer,
} from './tauri-utils';
import { getViewerLink } from './utils';

// Maximum file size (in bytes) to load directly into memory
// Files larger than this will require using the file picker
const MAX_DIRECT_LOAD_SIZE = 4 * 1024 * 1024 * 1024; // 4 GB

interface DropzoneContextValue {
  openFilePicker: () => void;
}

const DropzoneContext = createContext({} as DropzoneContextValue);

interface Props {}

function Dropzone(props: PropsWithChildren<Props>) {
  const { children } = props;
  const [pendingFileName, setPendingFileName] = useState<string | null>(null);
  const [pendingFilePath, setPendingFilePath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const openFiles = useStore((state) => state.openFiles);
  const navigate = useNavigate();

  // Handle File objects (from browser input or drag-and-drop)
  const handleFiles = useCallback(
    (files: File[]) => {
      const h5Files = files.map<LocalFile>((file) => {
        const url = URL.createObjectURL(file);
        return {
          name: file.name,
          url,
          service: FileService.Local,
          resolvedUrl: url,
          file,
        };
      });

      openFiles(h5Files);
      navigate(getViewerLink(h5Files[0].url));
      
      // Clear the pending state after successful load
      setPendingFileName(null);
      setPendingFilePath(null);
      setIsLoading(false);
    },
    [openFiles, navigate],
  );

  const { getRootProps, getInputProps, open, isDragActive } = useDropzone({
    noClick: true,
    noKeyboard: true,
    onDropAccepted: handleFiles,
  });

  // Handle file association (double-click to open)
  useEffect(() => {
    console.log('[Dropzone] useEffect running, isTauri:', isTauri());
    if (!isTauri()) return;
    
    let didLoadFile = false;
    
    getInitialFilePath().then(async (filePath) => {
      console.log('[Dropzone] getInitialFilePath returned:', filePath);
      if (!filePath || didLoadFile) return;
      
      didLoadFile = true; // Prevent double-loading in React Strict Mode
      
      const fileName = getFileName(filePath);
      console.log('[Dropzone] fileName:', fileName);
      
      // Check file size to decide loading strategy
      const fileSize = await getFileSize(filePath);
      console.log('[Dropzone] File size:', fileSize, 'bytes, limit:', MAX_DIRECT_LOAD_SIZE, 'bytes');
      
      if (fileSize !== null && fileSize <= MAX_DIRECT_LOAD_SIZE) {
        // Small file: load directly into memory
        console.log('[Dropzone] File is small enough, loading directly');
        setIsLoading(true);
        
        const buffer = await readFileAsBuffer(filePath);
        console.log('[Dropzone] Buffer loaded, size:', buffer?.byteLength);
        if (buffer) {
          // Create a File object from the buffer
          const file = new File([buffer], fileName, { type: 'application/x-hdf5' });
          await handleFiles([file]);
          // Clear the temp file now that we've loaded successfully
          if (isTauri()) {
            const { remove } = await import('@tauri-apps/plugin-fs');
            const tempDir = await import('@tauri-apps/api/path').then(m => m.tempDir());
            const tempPath = `${await tempDir}myhdf5_open_file.txt`;
            try { await remove(tempPath); } catch (e) { /* ignore */ }
          }
          // handleFiles will clear loading state
        } else {
          // Failed to read, show pending to use Explorer
          setIsLoading(false);
          setPendingFileName(fileName);
          setPendingFilePath(filePath);
        }
      } else {
        // Large file: show instructions to drag and drop
        console.log('[Dropzone] File is too large, showing pending overlay');
        setPendingFileName(fileName);
        setPendingFilePath(filePath);
      }
    });
  }, [handleFiles]);

  // Handle clicking on pending file - open file picker
  const handlePendingClick = useCallback(async () => {
    console.log('[Dropzone] handlePendingClick called, pendingFilePath:', pendingFilePath);
    if (pendingFilePath) {
      // Open file picker - it will open in default location but still useful
      const selectedPath = await openNativeFileDialog(pendingFilePath);
      console.log('[Dropzone] Selected path from dialog:', selectedPath);
      
      if (selectedPath) {
        // Try to load the selected file
        const fileSize = await getFileSize(selectedPath);
        console.log('[Dropzone] Selected file size:', fileSize, 'bytes');
        
        if (fileSize !== null && fileSize <= MAX_DIRECT_LOAD_SIZE) {
          // Small enough - read directly
          console.log('[Dropzone] Loading selected file into memory');
          setIsLoading(true);
          const buffer = await readFileAsBuffer(selectedPath);
          console.log('[Dropzone] Buffer loaded:', buffer?.byteLength, 'bytes');
          if (buffer) {
            const fileName = getFileName(selectedPath);
            const file = new File([buffer], fileName, { type: 'application/x-hdf5' });
            await handleFiles([file]);
          } else {
            setIsLoading(false);
          }
        } else {
          // Still too large - show alert and keep showing pending overlay
          console.log('[Dropzone] File still too large after selection');
          const sizeMB = Math.round((fileSize || 0) / 1024 / 1024);
          alert(
            `This file is too large (${sizeMB} MB).\n\n` +
            `Please drag and drop it from Explorer instead to avoid loading the entire file into memory at once.`
          );
          setPendingFileName(getFileName(selectedPath));
          setPendingFilePath(selectedPath);
        }
      } else {
        console.log('[Dropzone] No file selected (dialog cancelled)');
      }
    } else {
      open();
    }
  }, [pendingFilePath, handleFiles, open]);

  return (
    <div {...getRootProps({ className: styles.zone })}>
      <input {...getInputProps()} />
      {isDragActive && (
        <div className={styles.dropIt}>
          <p>Drop it!</p>
        </div>
      )}
      {isLoading && (
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>Loading {pendingFileName}...</p>
        </div>
      )}
      {pendingFileName && pendingFilePath && !isLoading && (
        <div className={styles.pendingFile} onClick={handlePendingClick}>
          <p>Click to select <strong>{pendingFileName}</strong></p>
          <p className={styles.pendingHint}>For large files, please drag and drop from Explorer instead.</p>
          <p className={styles.pendingHint}>This avoids loading the entire file into memory at once.</p>
        </div>
      )}
      <DropzoneContext.Provider value={{ openFilePicker: open }}>
        {children}
      </DropzoneContext.Provider>
    </div>
  );
}

export function useDropzoneContext() {
  return useContext(DropzoneContext);
}

export default Dropzone;
