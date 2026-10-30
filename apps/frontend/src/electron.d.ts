export interface DesktopMetrics {
  taskbarHeight: number;
  bottomExtra: number;
  topOffset: number;
  bounds?: { width: number; height: number; x: number; y: number };
  workArea?: { width: number; height: number; x: number; y: number };
}

export interface ElectronAPI {
  platform: string;
  setIgnoreMouseEvents?: (ignore: boolean, options?: { forward?: boolean }) => void;
  getMetricsSync?: () => DesktopMetrics | null;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
