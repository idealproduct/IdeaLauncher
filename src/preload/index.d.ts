import type { ElectronAPI } from "@electron-toolkit/preload";
import type { MinecraftVersion } from "@xmcl/installer";
import type {
  ContentSearch,
  ContentProject,
  ContentFile,
  ContentPage,
  DownloadTask,
  ContentKind,
  PackPreview,
} from "../shared/content";
import type {
  GlobalSettings,
  GpuAdapterSummary,
  InstanceSummary,
  InstanceProcessState,
  UpdateInstancePayload,
} from "../shared/launcher";

interface AccountSummary {
  username: string;
  xboxXuid: string;
  avatar?: string;
  expiresAt: number;
  isExpired: boolean;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: {
      getDownloads(): Promise<DownloadTask[]>;
      getDownloadSettings(): Promise<{ directory: string }>;
      chooseDownloadDirectory(): Promise<{ directory: string }>;
      resetDownloadDirectory(): Promise<{ directory: string }>;
      openDownloadDirectory(id?: string): Promise<void>;
      openRestrictedDownloads(id: string): Promise<void>;
      selectDownloadFiles(
        id: string,
      ): Promise<{ matched: number; rejected: string[] }>;
      onDownloadsChanged(callback: (tasks: DownloadTask[]) => void): () => void;
      enqueuePack(payload: {
        projectId: number;
        fileId: number;
        name: string;
      }): Promise<{ taskId: string }>;
      getContentConfiguration(): Promise<{ configured: boolean }>;
      searchContent(query: ContentSearch): Promise<ContentPage<ContentProject>>;
      getContentFiles(payload: {
        projectId: number;
        index?: number;
        gameVersion?: string;
        loader?: InstanceSummary["loader"];
      }): Promise<ContentPage<ContentFile>>;
      openContentProject(projectId: number): Promise<void>;
      installContent(payload: {
        projectId: number;
        fileId: number;
        instanceId: string;
        name?: string;
        kind?: ContentKind;
      }): Promise<{ taskId: string }>;
      preparePack(selection?: {
        projectId: number;
        fileId: number;
      }): Promise<PackPreview | null>;
      discardPack(token: string): Promise<void>;
      importPack(payload: {
        token: string;
        name: string;
      }): Promise<{ taskId: string }>;
      loginMicrosoft(): Promise<unknown>;
      getAccounts(): Promise<AccountSummary[]>;
      getSelectedAccount(): Promise<string | undefined>;
      setSelectedAccount(xuid: string): Promise<unknown>;
      logout(xuid: string): Promise<AccountSummary[]>;
      getMinecraftVersions(): Promise<{
        success: boolean;
        data: MinecraftVersion[];
        error?: string;
      }>;
      getGpuAdapters(): Promise<GpuAdapterSummary[]>;
      getInstances(): Promise<InstanceSummary[]>;
      updateInstance(payload: UpdateInstancePayload): Promise<InstanceSummary>;
      launchInstance(instanceId: string): Promise<{ success: true }>;
      stopInstance(instanceId: string): Promise<{ success: true }>;
      getProcessStates(): Promise<InstanceProcessState[]>;
      onProcessState(
        callback: (state: InstanceProcessState) => void,
      ): () => void;
      getGlobalSettings(): Promise<GlobalSettings>;
      saveGlobalSettings(settings: GlobalSettings): Promise<GlobalSettings>;
      deleteInstance(
        instanceId: string,
        deleteFiles?: boolean,
      ): Promise<{ success: true }>;
      createInstance(payload: {
        name: string;
        version: string;
        loader: "vanilla" | "forge" | "fabric" | "neoforge";
        launchAfterInstall?: boolean;
      }): Promise<unknown>;
      onInstanceInstallProgress(
        callback: (percent: number) => void,
      ): () => void;
      onInstanceLog(
        callback: (log: {
          instanceId: string;
          instanceName: string;
          timestamp: string;
          message: string;
        }) => void,
      ): () => void;
    };
  }
}
