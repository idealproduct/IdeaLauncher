import { ElectronAPI } from '@electron-toolkit/preload'
import type { MinecraftVersion } from '@xmcl/installer';

export { };

declare global {
  interface Window {
    electron: ElectronAPI
    api: {

      loginMicrosoft:
      () => Promise<{
        username: string;
        minecraftAccessToken: string;
        expiresIn: number;
        xboxXuid: string;
        xboxUhs: string;
        avatar?: string;
      }>;

      getMinecraftVersions:
      () => Promise<{
        success: boolean;
        data: MinecraftVersion[];
        error?: string;
      }>;

      getAccounts: () => Promise<{
        username: string;
        xboxXuid: string;
        avatar?: string;
        expiresAt: number;
        isExpired: boolean;
      }[]>;
      getSelectedAccount: () => Promise<string | undefined>;
      setSelectedAccount: (xuid: string) => Promise<unknown>;
      logout: (xuid: string) => Promise<{
        username: string;
        xboxXuid: string;
        avatar?: string;
        expiresAt: number;
        isExpired: boolean;
      }[]>;

      getInstances: () => Promise<{
        id: string;
        name: string;
        minecraftVersion: string;
        loader: 'vanilla' | 'forge' | 'fabric' | 'neoforge';
        minMemory: number;
        maxMemory: number;
        jvmArgs: string[];
        javaMajorVersion: number;
        javaPathOverride?: string;
        offlineMode: boolean;
        offlineUsername?: string;
      }[]>;

      updateInstance: (payload: {
        id: string;
        name: string;
        minMemory: number;
        maxMemory: number;
        jvmArgs: string[];
        javaPathOverride?: string;
        offlineMode: boolean;
        offlineUsername?: string;
      }) => Promise<unknown>;

      launchInstance: (instanceId: string) => Promise<{ success: true }>;
      deleteInstance: (instanceId: string, deleteFiles?: boolean) => Promise<{ success: true }>;

      createInstance: (payload: {
        name: string;
        version: string;
        loader: 'vanilla' | 'forge' | 'fabric' | 'neoforge';
        launchAfterInstall?: boolean;
      }) => Promise<unknown>;
    };
  }
}
