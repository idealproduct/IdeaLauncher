import fs from "fs";
import path from "path";
import { app } from "electron";
import { MinecraftAccount } from "./MicrosoftAuth";

interface AccountsFile {
    selected?: string;
    accounts: MinecraftAccount[];
}

export class AccountManager {

    private readonly file: string;

    private data: AccountsFile = {
        accounts: [],
    };

    constructor() {

        this.file = path.join(
            app.getPath("userData"),
            "accounts.json"
        );

        this.load();
    }

    private load() {

        if (!fs.existsSync(this.file)) {

            this.save();

            return;
        }

        this.data = JSON.parse(
            fs.readFileSync(this.file, "utf8")
        );
    }

    private save() {

        fs.writeFileSync(
            this.file,
            JSON.stringify(this.data, null, 2)
        );
    }

    getAccounts() {
        return this.data.accounts;
    }

    addAccount(account: MinecraftAccount) {

        const index = this.data.accounts.findIndex(
            a => a.xboxXuid === account.xboxXuid
        );

        if (index === -1) {
            this.data.accounts.push(account);
        } else {
            this.data.accounts[index] = account;
        }

        this.data.selected = account.xboxXuid;

        this.save();
    }
}