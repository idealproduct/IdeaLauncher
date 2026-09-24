import type { MinecraftAccount } from "../../main/app/auth/MicrosoftAuth";

declare global {
    interface Window {

        api: {

            loginMicrosoft(): Promise<MinecraftAccount>;

            getAccounts(): Promise<MinecraftAccount[]>;

            getMinecraftVersions(): Promise<{
                success: boolean;
                data: import("@xmcl/installer").MinecraftVersion[];
                error?: string;
            }>;

        };

    }
}

export { };