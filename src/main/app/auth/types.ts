export interface MinecraftAccount {
  /** Minecraft UUID */
  id: string;

  /** Minecraft 玩家名稱 */
  username: string;

  /** Xbox Gamertag */
  gamertag: string;

  /** Xbox XUID */
  xuid: string;

  /** Xbox User Hash */
  uhs: string;

  /** 玩家頭像 */
  avatar: string;

  /** Minecraft Access Token */
  minecraftAccessToken: string;

  /** Microsoft Refresh Token */
  microsoftRefreshToken: string;

  /** Access Token 到期時間 (Unix ms) */
  expiresAt: number;
}

export interface AccountsFile {
  selected?: string;
  accounts: MinecraftAccount[];
}