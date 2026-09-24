import { ipcMain } from "electron";
import { OAuthServer } from "../auth/OAuthServer";
import { accountManager } from "../auth/manager";


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

    ipcMain.handle("auth:getSelectedAccount", () => accountManager.getSelectedAccountId());
    ipcMain.handle("auth:setSelectedAccount", (_event, xuid: string) => accountManager.setSelectedAccount(xuid));
    ipcMain.handle("auth:logout", (_event, xuid: string) => accountManager.removeAccount(xuid));

}