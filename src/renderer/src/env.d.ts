/// <reference types="vite/client" />

interface Window {
    api: {
        loginMicrosoft(): Promise<MinecraftAccount>;
        getAccounts(): Promise<MinecraftAccount[]>;
    };
}
