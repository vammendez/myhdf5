import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';

import styles from './Dropzone.module.css';
import { FileService, type LocalFile, useStore } from './stores';
import { isTauri, setupFileDropHandler } from './tauri-utils';
import { getViewerLink } from './utils';

interface DropzoneContextValue {
  openFilePicker: () => void;
}

const DropzoneContext = createContext({} as DropzoneContextValue);

interface Props {}

function Dropzone(props: PropsWithChildren<Props>) {
  const { children } = props;
  const [isLoading, setIsLoading] = useState(false);
  const loadingRef = useRef(false); // Prevent concurrent loads

  const openFiles = useStore((state) => state.openFiles);
  const navigate = useNavigate();

  const onDropAccepted = useCallback(
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
    },
    [openFiles, navigate],
  );

  const { getRootProps, getInputProps, open, isDragActive } = useDropzone({
    noClick: true,
    noKeyboard: true,
    onDropAccepted,
  });

  // Set up Tauri file drop handler
  useEffect(() => {
    if (isTauri()) {
      setupFileDropHandler(async (filePath) => {
        // Prevent loading if already loading
        if (loadingRef.current) {
          console.log('Already loading a file, ignoring duplicate drop event');
          return;
        }
        
        const fileName = filePath.split(/[\\/]/).pop() || 'file.h5';
        
        loadingRef.current = true;
        setIsLoading(true);
        try {
          // Import Tauri's fs module dynamically
          const { readFile } = await import('@tauri-apps/plugin-fs');
          
          // Read the file content as Uint8Array
          const fileContent = await readFile(filePath);
          
          // Create a File object from the binary data
          const blob = new Blob([fileContent], { type: 'application/x-hdf5' });
          const file = new File([blob], fileName, { type: 'application/x-hdf5' });
          
          // Create object URL for the file
          const url = URL.createObjectURL(file);
          
          const localFile: LocalFile = {
            name: fileName,
            url: filePath, // Keep original path as identifier
            service: FileService.Local,
            resolvedUrl: url,
            file: file,
          };

          openFiles([localFile]);
          navigate(getViewerLink(filePath));
        } catch (error) {
          console.error('Failed to load dropped file:', error);
        } finally {
          setIsLoading(false);
          // Reset the flag after a short delay to allow the navigation to complete
          setTimeout(() => {
            loadingRef.current = false;
          }, 500);
        }
      });
    }
  }, [openFiles, navigate]);

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
          <p>Loading file...</p>
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
