/// <reference types="vite/client" />

interface Window {
    api: {
        [x: string]: any;
        loginMicrosoft(): Promise<MinecraftAccount>;
        getAccounts(): Promise<{
            username: string;
            xboxXuid: string;
            avatar?: string;
            expiresAt: number;
            isExpired: boolean;
        }[]>;
        getSelectedAccount(): Promise<string | undefined>;
        setSelectedAccount(xuid: string): Promise<unknown>;
        logout(xuid: string): Promise<{
            username: string;
            xboxXuid: string;
            avatar?: string;
            expiresAt: number;
            isExpired: boolean;
        }[]>;
        getMinecraftVersions(): Promise<{
            success: boolean;
            data: import("@xmcl/installer").MinecraftVersion[];
            error?: string;
        }>;
        getGpuAdapters(): Promise<{
            id: string;
            name: string;
            vendorId: string;
            deviceId: string;
            subsysId: string;
        }[]>;
        onInstanceLog(callback: (log: { instanceId: string; instanceName: string; timestamp: string; message: string }) => void): () => void;
        getInstances(): Promise<{
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
            gpuAdapter?: string;
        }[]>;
        updateInstance(payload: {
            id: string;
            name: string;
            minMemory: number;
            maxMemory: number;
            jvmArgs: string[];
            javaPathOverride?: string;
            gpuAdapter?: string;
            offlineMode: boolean;
            offlineUsername?: string;
        }): Promise<unknown>;
        launchInstance(instanceId: string): Promise<{ success: true }>;
        deleteInstance(instanceId: string, deleteFiles?: boolean): Promise<{ success: true }>;
        createInstance(payload: {
            name: string;
            version: string;
            loader: 'vanilla' | 'forge' | 'fabric' | 'neoforge';
            launchAfterInstall?: boolean;
        }): Promise<unknown>;
    };
}
