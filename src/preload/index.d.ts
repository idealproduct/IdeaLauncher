import { ElectronAPI } from '@electron-toolkit/preload'


export {};

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

        };
  }
}
