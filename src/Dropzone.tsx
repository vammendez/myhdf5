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
  readFileAsBuffer,
} from './tauri-utils';
import { getViewerLink } from './utils';

// Maximum file size (in bytes) to load directly into memory
// Files larger than this will require using the file picker
const MAX_DIRECT_LOAD_SIZE = 1 * 1024 * 1024 * 1024; // 1 GB

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
  const [isLargeFile, setIsLargeFile] = useState(false);

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
      setIsLargeFile(false);
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
    if (!isTauri()) {
      return;
    }
    
    let didLoadFile = false;
    
    void getInitialFilePath().then(async (filePath) => {
      if (!filePath || didLoadFile) {
        return;
      }
      
      didLoadFile = true; // Prevent double-loading in React Strict Mode
      
      const fileName = getFileName(filePath);
      
      // Helper to clean up temp file
      const cleanupTempFile = async () => {
        if (isTauri()) {
          try {
            const { remove } = await import('@tauri-apps/plugin-fs');
            const tempDir = await import('@tauri-apps/api/path').then((m) => m.tempDir());
            const tempPath = `${await tempDir}myhdf5_open_file.txt`;
            await remove(tempPath);
          } catch {
            /* ignore */
          }
        }
      };
      
      // Check file size to decide loading strategy
      const fileSize = await getFileSize(filePath);
      
      if (fileSize === null) {
        // Could not get file size - fail silently
        await cleanupTempFile();
      } else if (fileSize <= MAX_DIRECT_LOAD_SIZE) {
        // Small file: load directly into memory
        setIsLoading(true);
        
        const buffer = await readFileAsBuffer(filePath);
        if (buffer) {
          // Create a File object from the buffer
          const file = new File([buffer], fileName, { type: 'application/x-hdf5' });
          await handleFiles([file]);
          // Clear the temp file now that we've loaded successfully
          await cleanupTempFile();
          // handleFiles will clear loading state
        } else {
          // Failed to read - just stop loading
          setIsLoading(false);
          await cleanupTempFile();
        }
      } else {
        // Large file: exceeds MAX_DIRECT_LOAD_SIZE, show instructions to use picker or drag-and-drop
        setPendingFileName(fileName);
        setPendingFilePath(filePath);
        setIsLargeFile(true);
        // Don't cleanup temp file yet - we're showing the pending overlay
      }
    }).catch((error) => {
      console.error('[Dropzone] Error loading initial file:', error);
    });
  }, [handleFiles]);

  // Handle clicking on pending file - open file picker
  const handlePendingClick = useCallback(async () => {
    // Clean up temp file
    if (isTauri()) {
      try {
        const { remove } = await import('@tauri-apps/plugin-fs');
        const tempDir = await import('@tauri-apps/api/path').then((m) => m.tempDir());
        const tempPath = `${await tempDir}myhdf5_open_file.txt`;
        await remove(tempPath);
      } catch {
        /* ignore */
      }
    }
    
    // Clear pending state
    setPendingFileName(null);
    setPendingFilePath(null);
    setIsLargeFile(false);
    
    // Open the browser's file picker
    open();
  }, [open]);

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
          <div className={styles.spinner} />
          <p>Loading {pendingFileName}...</p>
        </div>
      )}
      {pendingFileName && pendingFilePath && !isLoading && isLargeFile && (
        <div className={styles.pendingFile}>
          <p>Please drag and drop the file here due to technical limitations of this app.</p>
          <p className={styles.pendingHint}>
            If you prefer, you can browse the file by clicking{' '}
            <span 
              onClick={handlePendingClick}
              style={{ 
                color: '#4a9eff', 
                textDecoration: 'underline', 
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Here
            </span>
            .
          </p>
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
