export interface DesktopMetrics {
  taskbarHeight: number;
  bottomExtra: number;
  topOffset: number;
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
