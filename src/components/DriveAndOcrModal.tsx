import React, { useState, useEffect } from 'react';
import {
  X,
  Cloud,
  FileText,
  Image as ImageIcon,
  Folder as FolderIcon,
  ChevronRight,
  ArrowLeft,
  Search,
  RefreshCw,
  FolderPlus,
  Upload,
  Sparkles,
  Check,
  AlertCircle,
  HardDrive,
  LogOut,
  FileDown,
  Brain,
  Trash2,
  Plus
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  initAuth,
  googleSignIn,
  googleSignOut,
  listDriveFolderContents,
  downloadDriveFileBlob,
  DriveItem,
  BreadcrumbItem,
} from '../services/googleDriveAuth';

export interface ImportedDocumentData {
  title: string;
  fileName: string;
  fileSize: string;
  summary: string;
  chapters: string[];
  conceptualContext: string;
  createNewFolder: boolean;
  tipoDocumento?: string;
  materias?: string[];
  preguntasBanco?: any[];
}

interface DriveAndOcrModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDocumentImported?: (data: ImportedDocumentData) => void;
  onDocumentsImported?: (data: ImportedDocumentData[]) => void;
  currentFolderName: string;
}

// Convert a Blob or File slice into base64 string
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64Clean = result.split(',')[1] || result;
      resolve(base64Clean);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// Smart chunked uploader to bypass reverse proxy (Cloud Run) 32MB body limits
async function uploadDocumentSmart(
  fileOrBlob: File | Blob,
  fileName: string,
  mimeType: string,
  onProgress: (status: string, percent: number) => void
): Promise<any> {
  const CHUNK_SIZE = 6 * 1024 * 1024; // 6 MB per slice (~8 MB base64, safely under Cloud Run 32 MB)
  const fileSize = fileOrBlob.size;

  // Single-request fast-track for small files <= 10 MB
  if (fileSize <= 10 * 1024 * 1024) {
    onProgress(`Leyendo "${fileName}"...`, 20);
    const base64Data = await blobToBase64(fileOrBlob);
    onProgress(`Gemini 3.8 Flash asimilando temario y conceptos profundos...`, 60);

    const response = await fetch('/api/ocr-process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base64Data,
        mimeType,
        fileName,
      }),
    });

    const resText = await response.text();
    let data: any = {};
    try {
      data = JSON.parse(resText);
    } catch {
      throw new Error(`Error del servidor (${response.status}): ${resText.slice(0, 100)}`);
    }

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Error al analizar el documento.');
    }

    onProgress(`¡"${fileName}" asimilado!`, 100);
    return data;
  }

  // Heavy file (e.g. 36 MB, 50 MB, 100 MB): Split into 6 MB chunks
  const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
  const uploadId = `up-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
    const start = chunkIdx * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, fileSize);
    const chunkBlob = fileOrBlob.slice(start, end);

    const uploadPercent = Math.round((chunkIdx / totalChunks) * 85);
    onProgress(
      `Subiendo fragmento ${chunkIdx + 1}/${totalChunks} (${(fileSize / (1024 * 1024)).toFixed(1)} MB)...`,
      uploadPercent
    );

    const chunkBase64 = await blobToBase64(chunkBlob);

    const response = await fetch('/api/ocr-chunk-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploadId,
        chunkIndex: chunkIdx,
        totalChunks,
        fileName,
        mimeType,
        chunkBase64,
      }),
    });

    const resText = await response.text();
    let data: any = {};
    try {
      data = JSON.parse(resText);
    } catch {
      throw new Error(`Error en fragmento (${response.status}): ${resText.slice(0, 100)}`);
    }

    if (!response.ok || !data.success) {
      throw new Error(data.error || `Error en el fragmento ${chunkIdx + 1}`);
    }

    // Last chunk: Server completed the AI analysis
    if (chunkIdx === totalChunks - 1) {
      onProgress(`Gemini 3.8 Flash sintetizando temario y conceptos profundos...`, 95);
      return data;
    }
  }
}

export default function DriveAndOcrModal({
  isOpen,
  onClose,
  onDocumentImported,
  onDocumentsImported,
  currentFolderName,
}: DriveAndOcrModalProps) {
  const [activeTab, setActiveTab] = useState<'local' | 'drive'>('local');

  // Google Drive Auth state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  // Folder navigation in Drive
  const [currentFolderId, setCurrentFolderId] = useState<string>('root');
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([
    { id: 'root', name: 'Mi Unidad' },
  ]);
  const [driveItems, setDriveItems] = useState<DriveItem[]>([]);
  const [loadingDriveItems, setLoadingDriveItems] = useState<boolean>(false);
  const [filterType, setFilterType] = useState<'all' | 'pdf' | 'img'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDriveFiles, setSelectedDriveFiles] = useState<DriveItem[]>([]);

  // Local Multiple Files state
  const [localFiles, setLocalFiles] = useState<File[]>([]);

  // Destination folder choice
  const [createNewFolder, setCreateNewFolder] = useState<boolean>(true);

  // AI Processing & Progress state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processStep, setProcessStep] = useState<string>('');
  const [processPercent, setProcessPercent] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [authScopeError, setAuthScopeError] = useState<boolean>(false);

  // Initialize Auth listener on mount
  useEffect(() => {
    if (!isOpen) return;
    const unsubscribe = initAuth(
      (user, token) => {
        setCurrentUser(user);
        setAccessToken(token);
        loadFolder(token, 'root');
      },
      () => {
        setCurrentUser(null);
        setAccessToken(null);
        setDriveItems([]);
      }
    );
    return () => unsubscribe();
  }, [isOpen]);

  const loadFolder = async (token: string, folderId: string, search: string = '') => {
    setLoadingDriveItems(true);
    setErrorMessage(null);
    setAuthScopeError(false);
    try {
      const items = await listDriveFolderContents(token, folderId, search);
      setDriveItems(items);
    } catch (err: any) {
      const msg = err.message || 'Error al conectar con Google Drive.';
      setErrorMessage(msg);
      if (msg.toLowerCase().includes('permisos insuficientes') || msg.toLowerCase().includes('scopes')) {
        setAuthScopeError(true);
      }
    } finally {
      setLoadingDriveItems(false);
    }
  };

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setErrorMessage(null);
    setAuthScopeError(false);
    try {
      const res = await googleSignIn();
      if (res) {
        setCurrentUser(res.user);
        setAccessToken(res.accessToken);
        setCurrentFolderId('root');
        setBreadcrumbs([{ id: 'root', name: 'Mi Unidad' }]);
        await loadFolder(res.accessToken, 'root');
      }
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setErrorMessage(err.message || 'Error al iniciar sesión con Google.');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await googleSignOut();
      setCurrentUser(null);
      setAccessToken(null);
      setDriveItems([]);
      setSelectedDriveFiles([]);
      setBreadcrumbs([{ id: 'root', name: 'Mi Unidad' }]);
      setCurrentFolderId('root');
    } catch (e: any) {
      console.error(e);
    }
  };

  const handleOpenFolder = (folder: DriveItem) => {
    if (!accessToken) return;
    const nextBreadcrumbs = [...breadcrumbs, { id: folder.id, name: folder.name }];
    setBreadcrumbs(nextBreadcrumbs);
    setCurrentFolderId(folder.id);
    loadFolder(accessToken, folder.id);
  };

  const handleNavigateBreadcrumb = (index: number) => {
    if (!accessToken) return;
    const target = breadcrumbs[index];
    const nextBreadcrumbs = breadcrumbs.slice(0, index + 1);
    setBreadcrumbs(nextBreadcrumbs);
    setCurrentFolderId(target.id);
    loadFolder(accessToken, target.id);
  };

  const handleGoUp = () => {
    if (breadcrumbs.length <= 1 || !accessToken) return;
    handleNavigateBreadcrumb(breadcrumbs.length - 2);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (accessToken) {
      loadFolder(accessToken, currentFolderId, searchQuery);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    if (accessToken) {
      loadFolder(accessToken, currentFolderId, '');
    }
  };

  // Toggle Drive file selection (supports multiple files)
  const toggleSelectDriveFile = (item: DriveItem) => {
    setSelectedDriveFiles((prev) => {
      const exists = prev.some((f) => f.id === item.id);
      if (exists) {
        return prev.filter((f) => f.id !== item.id);
      } else {
        return [...prev, item];
      }
    });
  };

  // Add local files (supports multiple selection)
  const handleAddLocalFiles = (filesList: FileList | null) => {
    if (!filesList || filesList.length === 0) return;
    const newFiles = Array.from(filesList);
    const validFiles: File[] = [];

    for (const f of newFiles) {
      if (f.size > 150 * 1024 * 1024) {
        setErrorMessage(`"${f.name}" (${(f.size / (1024 * 1024)).toFixed(1)} MB) supera el límite de 150 MB.`);
        continue;
      }
      validFiles.push(f);
    }

    if (validFiles.length > 0) {
      setErrorMessage(null);
      setLocalFiles((prev) => {
        // avoid duplicates by name and size
        const combined = [...prev];
        for (const vf of validFiles) {
          if (!combined.some((c) => c.name === vf.name && c.size === vf.size)) {
            combined.push(vf);
          }
        }
        return combined;
      });
    }
  };

  const handleRemoveLocalFile = (index: number) => {
    setLocalFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes?: string | number) => {
    if (!bytes) return '';
    const num = typeof bytes === 'number' ? bytes : parseInt(bytes, 10);
    if (isNaN(num)) return '';
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(0)} KB`;
    return `${(num / (1024 * 1024)).toFixed(1)} MB`;
  };

  const totalLocalSize = localFiles.reduce((acc, f) => acc + f.size, 0);

  // Process Document(s) from Google Drive
  const handleProcessDriveDocuments = async () => {
    if (selectedDriveFiles.length === 0 || !accessToken) return;
    setIsProcessing(true);
    setErrorMessage(null);
    setProcessPercent(0);

    const importedList: ImportedDocumentData[] = [];

    try {
      for (let i = 0; i < selectedDriveFiles.length; i++) {
        const fileItem = selectedDriveFiles[i];
        const prefix = selectedDriveFiles.length > 1 ? `[${i + 1}/${selectedDriveFiles.length}] ` : '';

        setProcessStep(`${prefix}Descargando "${fileItem.name}" de Drive...`);
        setProcessPercent(10);

        const { blob } = await downloadDriveFileBlob(
          accessToken,
          fileItem.id,
          fileItem.mimeType
        );

        const data = await uploadDocumentSmart(
          blob,
          fileItem.name,
          fileItem.mimeType,
          (msg, pct) => {
            setProcessStep(`${prefix}${msg}`);
            setProcessPercent(pct);
          }
        );

        importedList.push({
          title: data.title || fileItem.name.replace(/\.[^/.]+$/, ''),
          fileName: fileItem.name,
          fileSize: formatFileSize(fileItem.size),
          summary: data.summary,
          chapters: data.chapters || [],
          conceptualContext: data.conceptualContext,
          createNewFolder,
          tipoDocumento: data.tipoDocumento,
          materias: data.materias,
          preguntasBanco: data.preguntasBanco,
        });
      }

      setProcessStep(`¡${importedList.length} documento(s) asimilados como fuente de estudio!`);
      setProcessPercent(100);

      setTimeout(() => {
        if (onDocumentsImported) {
          onDocumentsImported(importedList);
        } else if (onDocumentImported && importedList.length > 0) {
          importedList.forEach((doc) => onDocumentImported(doc));
        }
        onClose();
      }, 700);
    } catch (err: any) {
      console.error('Error processing Drive file:', err);
      setErrorMessage(err.message || 'Error durante la asimilación del archivo.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Process Document(s) from Local Files (Supports CamScanner, multi-page PDFs, scans)
  const handleProcessLocalDocuments = async () => {
    if (localFiles.length === 0) return;
    setIsProcessing(true);
    setErrorMessage(null);
    setProcessPercent(0);

    const importedList: ImportedDocumentData[] = [];

    try {
      for (let i = 0; i < localFiles.length; i++) {
        const file = localFiles[i];
        const prefix = localFiles.length > 1 ? `[${i + 1}/${localFiles.length}] ` : '';

        const data = await uploadDocumentSmart(
          file,
          file.name,
          file.type || 'application/pdf',
          (msg, pct) => {
            setProcessStep(`${prefix}${msg}`);
            setProcessPercent(pct);
          }
        );

        importedList.push({
          title: data.title || file.name.replace(/\.[^/.]+$/, ''),
          fileName: file.name,
          fileSize: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
          summary: data.summary,
          chapters: data.chapters || [],
          conceptualContext: data.conceptualContext,
          createNewFolder,
          tipoDocumento: data.tipoDocumento,
          materias: data.materias,
          preguntasBanco: data.preguntasBanco,
        });
      }

      setProcessStep(`¡${importedList.length} documento(s) asimilados con éxito!`);
      setProcessPercent(100);

      setTimeout(() => {
        if (onDocumentsImported) {
          onDocumentsImported(importedList);
        } else if (onDocumentImported && importedList.length > 0) {
          importedList.forEach((doc) => onDocumentImported(doc));
        }
        onClose();
      }, 700);
    } catch (err: any) {
      console.error('Error processing local file:', err);
      setErrorMessage(err.message || 'Error durante el procesamiento del archivo.');
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredDriveItems = driveItems.filter((item) => {
    if (item.isFolder) return true;
    if (filterType === 'pdf') return item.mimeType === 'application/pdf';
    if (filterType === 'img') return item.mimeType.startsWith('image/');
    return true;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md">
      <div className="bg-[#151520] border border-[#2b2b3e] rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-7 py-4 border-b border-[#242436] bg-[#12121b]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-400 flex items-center justify-center text-white shadow-md">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white leading-tight flex items-center gap-2">
                <span>Explorador de Documentos & PDFs</span>
                <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded font-mono font-medium">
                  IA Gemini 3.8 Flash
                </span>
              </h2>
              <p className="text-xs text-gray-400">
                Sube libros, apuntes o exámenes pesados (hasta 150 MB por archivo) sin saturar tu pantalla.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="text-gray-400 hover:text-white p-2 rounded-xl hover:bg-white/5 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#222234] bg-[#12121c] px-6 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab('local')}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-bold transition border-b-2 cursor-pointer ${
              activeTab === 'local'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>Subir Varios PDFs (Local)</span>
            {localFiles.length > 0 && (
              <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.2 rounded-full font-mono">
                {localFiles.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('drive')}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-bold transition border-b-2 cursor-pointer ${
              activeTab === 'drive'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Cloud className="w-4 h-4" />
            <span>Navegar en Google Drive</span>
            {currentUser && <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />}
            {selectedDriveFiles.length > 0 && (
              <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.2 rounded-full font-mono">
                {selectedDriveFiles.length}
              </span>
            )}
          </button>
        </div>

        {/* Body Container */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          {/* TAB 1: LOCAL MULTI-PDF UPLOAD */}
          {activeTab === 'local' && (
            <div className="space-y-4">
              <label
                htmlFor="local-file-ocr-input"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleAddLocalFiles(e.dataTransfer.files);
                }}
                className={`border-2 border-dashed rounded-2xl p-6 text-center block transition cursor-pointer ${
                  localFiles.length > 0
                    ? 'border-blue-500/50 bg-blue-950/10'
                    : 'border-[#2d2d40] hover:border-blue-500/40 bg-[#161622] hover:bg-[#1a1a28]'
                }`}
              >
                <input
                  id="local-file-ocr-input"
                  type="file"
                  multiple
                  accept=".pdf,image/png,image/jpeg,image/webp,image/jpg"
                  className="hidden"
                  onChange={(e) => handleAddLocalFiles(e.target.files)}
                />

                <div className="space-y-2">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white block">
                      Haz clic para seleccionar o arrastra uno o varios PDFs pesados
                    </span>
                    <span className="text-[11px] text-gray-400 block mt-0.5">
                      CamScanner, libros escaneados o temarios (soporta hasta 150 MB por archivo en fragmentos continuos).
                    </span>
                  </div>
                </div>
              </label>

              {/* Selected Local Files List */}
              {localFiles.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-gray-300 px-1">
                    <span className="font-semibold">
                      Archivos listos para asimilar ({localFiles.length}):
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-gray-400">
                        Total: {formatFileSize(totalLocalSize)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setLocalFiles([])}
                        className="text-red-400 hover:text-red-300 text-[11px] hover:underline"
                      >
                        Limpiar lista
                      </button>
                    </div>
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                    {localFiles.map((file, idx) => (
                      <div
                        key={`${file.name}-${idx}`}
                        className="p-2.5 bg-[#181827] border border-[#2b2b3f] rounded-xl flex items-center justify-between text-xs text-gray-200"
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <FileText className="w-4 h-4 text-rose-400 shrink-0" />
                          <span className="truncate font-semibold">{file.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <span className="font-mono text-gray-400 text-[11px]">
                            {(file.size / (1024 * 1024)).toFixed(1)} MB
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveLocalFile(idx)}
                            className="text-gray-400 hover:text-red-400 p-1 rounded hover:bg-white/5 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <label
                    htmlFor="local-file-ocr-input-add"
                    className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 hover:underline cursor-pointer pt-1 px-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Agregar otro archivo PDF a este lote...</span>
                    <input
                      id="local-file-ocr-input-add"
                      type="file"
                      multiple
                      accept=".pdf,image/png,image/jpeg,image/webp,image/jpg"
                      className="hidden"
                      onChange={(e) => handleAddLocalFiles(e.target.files)}
                    />
                  </label>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: GOOGLE DRIVE NAVIGATION */}
          {activeTab === 'drive' && (
            <div className="space-y-4">
              {!currentUser ? (
                <div className="text-center py-8 px-4 border border-[#262638] rounded-2xl bg-[#14141f] space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                    <Cloud className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Conecta tu Google Drive</h3>
                    <p className="text-xs text-gray-400 max-w-md mx-auto mt-1">
                      Navega por tus carpetas y selecciona libros o temarios almacenados en tu nube.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogin}
                    disabled={isLoggingIn}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-lg shadow-blue-600/30 cursor-pointer disabled:opacity-50"
                  >
                    {isLoggingIn ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Conectando con Google...</span>
                      </>
                    ) : (
                      <>
                        <Cloud className="w-4 h-4" />
                        <span>Conectar Cuenta de Google</span>
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Account bar & Breadcrumbs */}
                  <div className="flex items-center justify-between p-2.5 bg-[#14141f] border border-[#242436] rounded-xl text-xs">
                    <div className="flex items-center gap-2 truncate">
                      <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0">
                        {currentUser.displayName?.[0] || currentUser.email?.[0] || 'U'}
                      </div>
                      <span className="text-gray-300 font-medium truncate">
                        {currentUser.displayName || currentUser.email}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="text-gray-400 hover:text-red-400 flex items-center gap-1 text-[11px] transition cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Desconectar</span>
                    </button>
                  </div>

                  {/* Breadcrumb path */}
                  <div className="flex items-center gap-1.5 text-xs text-gray-300 overflow-x-auto no-scrollbar py-1">
                    {breadcrumbs.map((crumb, idx) => (
                      <React.Fragment key={crumb.id}>
                        {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-gray-600 shrink-0" />}
                        <button
                          type="button"
                          onClick={() => handleNavigateBreadcrumb(idx)}
                          className={`hover:text-blue-400 transition truncate max-w-[120px] cursor-pointer ${
                            idx === breadcrumbs.length - 1 ? 'font-bold text-white' : 'text-gray-400'
                          }`}
                        >
                          {crumb.name}
                        </button>
                      </React.Fragment>
                    ))}
                  </div>

                  {/* Search and filters */}
                  <div className="flex flex-col sm:flex-row items-center gap-2">
                    <form onSubmit={handleSearchSubmit} className="flex-1 w-full">
                      <div className="relative">
                        <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Buscar documentos en tu Drive..."
                          className="w-full bg-[#12121a] border border-[#28283a] rounded-xl pl-9 pr-7 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                        />
                        {searchQuery && (
                          <button
                            type="button"
                            onClick={handleClearSearch}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-xs"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </form>
                  </div>

                  {/* Folder Contents Explorer */}
                  <div className="border border-[#232334] rounded-2xl p-2 bg-[#12121a] max-h-56 overflow-y-auto no-scrollbar space-y-1">
                    {loadingDriveItems ? (
                      <div className="p-8 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
                        <span>Cargando contenido de Google Drive...</span>
                      </div>
                    ) : filteredDriveItems.length === 0 ? (
                      <div className="p-8 text-center text-xs text-gray-500 space-y-2">
                        <p>Esta carpeta está vacía o no contiene archivos compatibles.</p>
                        {breadcrumbs.length > 1 && (
                          <button
                            type="button"
                            onClick={handleGoUp}
                            className="text-blue-400 hover:underline text-xs inline-flex items-center gap-1"
                          >
                            <ArrowLeft className="w-3 h-3" /> Volver a la carpeta anterior
                          </button>
                        )}
                      </div>
                    ) : (
                      filteredDriveItems.map((item) => {
                        const isSelected = selectedDriveFiles.some((f) => f.id === item.id);
                        if (item.isFolder) {
                          return (
                            <div
                              key={item.id}
                              onClick={() => handleOpenFolder(item)}
                              className="flex items-center justify-between p-2 rounded-xl text-xs hover:bg-[#1b1b2a] text-amber-200 transition cursor-pointer group"
                            >
                              <div className="flex items-center gap-2.5 truncate">
                                <FolderIcon className="w-4 h-4 text-amber-400 shrink-0" />
                                <span className="font-semibold text-gray-200 group-hover:text-amber-300 truncate">
                                  {item.name}
                                </span>
                              </div>
                              <span className="text-[10px] text-gray-500 group-hover:text-gray-300 flex items-center gap-1">
                                Abrir <ChevronRight className="w-3 h-3" />
                              </span>
                            </div>
                          );
                        }

                        const isPdf = item.mimeType === 'application/pdf';
                        return (
                          <div
                            key={item.id}
                            onClick={() => toggleSelectDriveFile(item)}
                            className={`flex items-center justify-between p-2.5 rounded-xl text-xs transition cursor-pointer ${
                              isSelected
                                ? 'bg-blue-600/20 border border-blue-500 text-white shadow-sm'
                                : 'hover:bg-[#181825] border border-transparent text-gray-300'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 truncate">
                              {isPdf ? (
                                <FileText className="w-4 h-4 text-rose-400 shrink-0" />
                              ) : (
                                <ImageIcon className="w-4 h-4 text-sky-400 shrink-0" />
                              )}
                              <div className="truncate">
                                <span className="font-medium truncate block">{item.name}</span>
                                <span className="text-[10px] text-gray-500 block">
                                  {isPdf ? 'PDF' : 'Documento'} · {formatFileSize(item.size)}
                                </span>
                              </div>
                            </div>

                            {isSelected ? (
                              <span className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white shrink-0">
                                <Check className="w-3 h-3" />
                              </span>
                            ) : (
                              <span className="text-[10px] text-gray-500 opacity-60 hover:opacity-100">
                                Seleccionar
                              </span>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Selected Drive Files Notice */}
                  {selectedDriveFiles.length > 0 && (
                    <div className="p-3 bg-blue-950/30 border border-blue-500/40 rounded-xl space-y-1.5 text-xs text-blue-200">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          {selectedDriveFiles.length} documento(s) seleccionados de Drive
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedDriveFiles([])}
                          className="text-gray-400 hover:text-red-400 text-[11px]"
                        >
                          Limpiar
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {selectedDriveFiles.map((f) => (
                          <span
                            key={f.id}
                            className="bg-[#192238] border border-blue-500/30 px-2 py-0.5 rounded-lg text-[11px] text-blue-100 flex items-center gap-1.5"
                          >
                            <span className="truncate max-w-[140px]">{f.name}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSelectDriveFile(f);
                              }}
                              className="text-gray-400 hover:text-white"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* How Thea Pro uses this document */}
          <div className="bg-[#181826] border border-[#272739] rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-200">
              <Brain className="w-4 h-4 text-blue-400" />
              <span>¿Cómo utilizará Thea Pro este material de estudio?</span>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              La IA asimilará el libro o archivos completos como <strong>fuente de conocimiento oficial</strong>. Generará quizzes progresivos de 4 niveles, tarjetas 3D Anki y dossiers con análisis largos y profundos, <em>sin abarrotar tu editor con 50 páginas de texto crudo</em>.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
              <label
                className={`flex items-center gap-2 p-2.5 rounded-xl border transition cursor-pointer ${
                  createNewFolder
                    ? 'bg-blue-600/20 border-blue-500 text-white'
                    : 'bg-[#151520] border-[#29293c] text-gray-400 hover:text-gray-200'
                }`}
              >
                <input
                  type="radio"
                  name="destFolder"
                  checked={createNewFolder}
                  onChange={() => setCreateNewFolder(true)}
                  className="hidden"
                />
                <FolderPlus className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="truncate">Crear nueva carpeta para este tema</span>
              </label>

              <label
                className={`flex items-center gap-2 p-2.5 rounded-xl border transition cursor-pointer ${
                  !createNewFolder
                    ? 'bg-blue-600/20 border-blue-500 text-white'
                    : 'bg-[#151520] border-[#29293c] text-gray-400 hover:text-gray-200'
                }`}
              >
                <input
                  type="radio"
                  name="destFolder"
                  checked={!createNewFolder}
                  onChange={() => setCreateNewFolder(false)}
                  className="hidden"
                />
                <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="truncate">Vincular a carpeta actual ({currentFolderName})</span>
              </label>
            </div>
          </div>

          {/* Progress Indicator */}
          {isProcessing && (
            <div className="p-4 bg-blue-950/30 border border-blue-500/40 rounded-2xl space-y-2 animate-pulse">
              <div className="flex items-center justify-between text-xs text-blue-300">
                <span className="font-semibold">{processStep}</span>
                <span className="font-mono">{processPercent}%</span>
              </div>
              <div className="w-full h-2 bg-[#12121b] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 transition-all duration-300"
                  style={{ width: `${processPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 bg-red-950/40 border border-red-500/50 rounded-xl text-xs text-red-300 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
              <div className="space-y-1">
                <p className="leading-relaxed font-medium">{errorMessage}</p>
                {authScopeError && (
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="text-red-200 underline font-semibold hover:text-white mt-1 block"
                  >
                    Haz clic aquí para desconectar y reautenticar con permisos de Drive
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 sm:px-7 py-4 border-t border-[#222234] bg-[#12121b] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 text-xs font-semibold text-gray-400 hover:text-white transition cursor-pointer"
          >
            Cerrar
          </button>

          {activeTab === 'local' ? (
            <button
              type="button"
              onClick={handleProcessLocalDocuments}
              disabled={localFiles.length === 0 || isProcessing}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold transition shadow-lg shadow-blue-600/30 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Procesando...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {localFiles.length <= 1
                      ? 'Asimilar PDF Local'
                      : `Asimilar ${localFiles.length} Documentos de Estudio`}
                  </span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleProcessDriveDocuments}
              disabled={selectedDriveFiles.length === 0 || isProcessing}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold transition shadow-lg shadow-blue-600/30 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Descargando y analizando...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {selectedDriveFiles.length <= 1
                      ? 'Asimilar Documento de Drive'
                      : `Asimilar ${selectedDriveFiles.length} Documentos de Drive`}
                  </span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
