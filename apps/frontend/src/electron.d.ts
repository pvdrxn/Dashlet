export interface DesktopMetrics {
  taskbarHeight: number;
  bottomExtra: number;
  topOffset: number;
  bounds?: { width: number; height: number; x: number; y: number };
  workArea?: { width: number; height: number; x: number; y: number };
}

export interface ElectronAPI {
  platform: string;
  minimize?: () => void;
  maximize?: () => void;
  close?: (toTray?: boolean) => void;
  isMaximized?: () => boolean;
  toggleFullscreen?: () => void;
  isFullScreen?: () => boolean;
  onMaximizeChanged?: (callback: (isMaximized: boolean) => void) => () => void;
  setIgnoreMouseEvents?: (ignore: boolean, options?: { forward?: boolean }) => void;
  getMetricsSync?: () => DesktopMetrics | null;
  hideWindow?: () => void;
  showWindow?: () => void;
  onEscapePressed?: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
