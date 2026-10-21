import fs from "fs";
import path from "path";
import { app } from "electron";
import { MinecraftAccount } from "./MicrosoftAuth";

export interface AccountSummary {
    xboxXuid: string;
    username: string;
    avatar?: string;
    expiresAt: number;
    isExpired: boolean;
}

interface AccountsFile {
    selected?: string;
    accounts: MinecraftAccount[];
}

function normalizeAccount(value: unknown): MinecraftAccount | undefined {
    if (!value || typeof value !== "object") return undefined;

    const account = value as Partial<MinecraftAccount> & { xuid?: string };
    if (typeof account.id !== "string" || typeof account.username !== "string") return undefined;

    return {
        ...account,
        xboxXuid: account.xboxXuid ?? account.xuid ?? account.id,
    } as MinecraftAccount;
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

    private load(): void {
        try {
            const parsed = JSON.parse(fs.readFileSync(this.file, "utf8")) as Partial<AccountsFile>;
            this.data = {
                selected: typeof parsed.selected === "string" ? parsed.selected : undefined,
                accounts: Array.isArray(parsed.accounts)
                    ? parsed.accounts.map(normalizeAccount).filter(
                        (account): account is MinecraftAccount => account !== undefined,
                    )
                    : [],
            };
            if (!this.data.accounts.some((account) => account.xboxXuid === this.data.selected)) {
                this.data.selected = undefined;
            }
        } catch {
            this.data = { accounts: [] };
        }

        this.save();
    }

    private save() {

        fs.writeFileSync(
            this.file,
            JSON.stringify(this.data, null, 2)
        );
    }

    getAccounts(): AccountSummary[] {
        return this.data.accounts.map((account): AccountSummary => ({
            xboxXuid: account.xboxXuid,
            username: account.username,
            avatar: account.avatar,
            expiresAt: account.expiresAt ?? 0,
            isExpired: !account.expiresAt || account.expiresAt <= Date.now(),
        }));
    }

    getSelectedAccountId(): string | undefined {
        return this.data.selected;
    }

    setSelectedAccount(xuid: string): AccountSummary[] {
        if (!this.data.accounts.some((account) => account.xboxXuid === xuid)) {
            throw new Error("Account not found");
        }
        this.data.selected = xuid;
        this.save();
        return this.getAccounts();
    }

    removeAccount(xuid: string): AccountSummary[] {
        this.data.accounts = this.data.accounts.filter((account) => account.xboxXuid !== xuid);
        if (this.data.selected === xuid) this.data.selected = this.data.accounts[0]?.xboxXuid;
        this.save();
        return this.getAccounts();
    }

    getSelectedAccount() {
        return this.data.accounts.find(
            account => account.xboxXuid === this.data.selected
        );
    }

    addAccount(account: MinecraftAccount) {
        const normalizedAccount = normalizeAccount(account);
        if (!normalizedAccount) {
            throw new Error("Invalid account data");
        }

        const accountWithExpiry: MinecraftAccount = {
            ...normalizedAccount,
            expiresAt: normalizedAccount.expiresAt ?? Date.now() + normalizedAccount.expiresIn * 1000,
        };

        const index = this.data.accounts.findIndex(
            a => a.xboxXuid === accountWithExpiry.xboxXuid
        );

        if (index === -1) {
            this.data.accounts.push(accountWithExpiry);
        } else {
            this.data.accounts[index] = accountWithExpiry;
        }

        this.data.selected = accountWithExpiry.xboxXuid;

        this.save();
    }
}
