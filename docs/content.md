# 內容搜尋與模組包匯入

左側「探索內容」可搜尋 CurseForge 的模組包、模組、光影與材質包。

- 搜尋可搭配 Minecraft 版本；模組另可篩選 Forge、Fabric 或 NeoForge。
- 點選「選擇版本」後選取檔案。模組、光影與材質包會列出相容版本的實例；執行中的實例無法安裝內容。
- 模組會補齊 CurseForge 標記的必要依賴。材質包需於遊戲中啟用；光影需實例具備 Iris、OptiFine 等支援。
- 模組包會建立獨立實例，採用包內指定的 Minecraft 與載入器版本。
- 「匯入模組包」支援 CurseForge ZIP（根目錄含 `manifest.json`）及 Modrinth MRPACK（含 `modrinth.index.json`）。支援 Forge、Fabric、NeoForge，亦可匯入未指定載入器的原版包。
- 若作者不允許第三方自動下載，會先彙整全部受限檔案及總數。確認一次即可在內建下載視窗載入所有待下載的 CurseForge 頁面，下載完成並通過大小與雜湊驗證後，安裝會自動接續。也可批次選取已下載的本機檔案。

## 下載中心與下載位置

左側下載圖示和右上角「下載」可進入下載中心，查看排隊、檢查、下載、安裝、等待手動檔案、完成或失敗的項目。進度包含實際已接收容量、內容檔案數、目前檔案及安裝階段。啟動器開啟期間，切換頁面或縮小視窗均不影響背景任務；等待手動檔案的項目會讓其他任務繼續執行。

下載位置預設為作業系統的「下載」資料夾，可在全域設定中變更或還原。每個任務會建立獨立子資料夾；自動下載與內建視窗下載都使用該任務的資料夾。變更位置會立即儲存，僅影響之後加入的任務。內建視窗可透過上方「下載頁面」選單切換各個官方頁面。

目前任務佇列保存在主程序記憶體，重啟啟動器後不會自動恢復未完成任務。已下載檔案會保留在指定資料夾。

下載先完成驗證，再套用至目標實例。既有實例的多檔案安裝若提交失敗，會回復已變更的檔案。匯入新模組包失敗時不保留未完成的實例；共用的遊戲資源快取可供下次重試使用。

## 金鑰

API Key 僅由 Electron 主程序使用。支援本機應用程式資料目錄內以 OS `safeStorage` 加密的 `curseforge-key.enc`，或 `CURSEFORGE_API_KEY` / `IDEALAUNCHER_CURSEFORGE_API_KEY` 環境變數。環境變數優先。前端沒有金鑰輸入或讀取介面；原始碼不包含實際金鑰。

`scripts/configure-curseforge.cjs` 可從標準輸入取得金鑰、加密保存並驗證官方 API。請勿將實際金鑰加入原始碼或提交至版本控制。

## 驗證

```sh
pnpm run build
pnpm run test:launcher
pnpm exec node scripts/smoke-content.cjs
pnpm exec node scripts/smoke-downloads.cjs
```

`smoke-content.cjs` 是需要網路及有效金鑰的實際連線測試。`smoke-downloads.cjs` 使用隔離資料夾與本機測試網頁，驗證主程序背景任務及真正的 Electron 批次下載，不會修改使用者實例或設定。

規格參考：[CurseForge 官方 API](https://docs.curseforge.com/rest-api/)、[Modrinth MRPACK 格式](https://support.modrinth.com/en/articles/8802351-modrinth-modpack-format-mrpack)。
