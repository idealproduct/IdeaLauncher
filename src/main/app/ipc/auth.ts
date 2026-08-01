import { ipcMain } from "electron";
import { OAuthServer } from "../auth/OAuthServer";


export function registerAuthIPC() {

    ipcMain.handle(
        "auth:microsoft",
        async () => {

            const oauth =
                new OAuthServer();


            const account =
                await oauth.login();


            return account;

        }
    );

}