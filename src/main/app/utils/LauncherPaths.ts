import { app } from "electron";
import path from "path";

export class LauncherPaths {

    static get data() {
        return app.getPath("userData");
    }

    static get accounts() {
        return path.join(this.data, "accounts.json");
    }

}