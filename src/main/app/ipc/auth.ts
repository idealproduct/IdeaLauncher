import { ipcMain } from "electron";
import { OAuthServer } from "../auth/OAuthServer";
import { accountManager } from "../..";


export function registerAuthIPC() {

    ipcMain.handle(
        "auth:microsoft",
        async () => {

            const oauth =
                new OAuthServer();


            const account =
                await oauth.login();

            accountManager.addAccount(account);


            return account;

        }
    );

    ipcMain.handle(
        "auth:getAccounts",
        () => {

            return accountManager.getAccounts();

        }
    );

}