import { useEffect, useState } from "react";
import { Button, Form, Spin, Alert, message } from "antd";
import { SaveOutlined, FolderOpenOutlined } from "@ant-design/icons";
import LaunchSettingsFields from "../components/LaunchSettingsFields";
import {
  defaultGlobalSettings,
  validateLaunchSettings,
  type GlobalSettings,
  type GpuAdapterSummary,
} from "../../../shared/launcher";

export default function Settings(): React.JSX.Element {
  const [settings, setSettings] = useState<GlobalSettings>(
    defaultGlobalSettings,
  );
  const [adapters, setAdapters] = useState<GpuAdapterSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [downloadDirectory, setDownloadDirectory] = useState("");
  const [directoryBusy, setDirectoryBusy] = useState(false);
  const [directoryError, setDirectoryError] = useState("");

  useEffect(() => {
    let active = true;
    void window.api
      .getDownloadSettings()
      .then((value) => {
        if (active) setDownloadDirectory(value.directory);
      })
      .catch((reason) => {
        if (active)
          setDirectoryError(
            reason instanceof Error ? reason.message : "無法載入下載位置",
          );
      });
    void window.api
      .getGlobalSettings()
      .then((value) => {
        if (active) setSettings(value);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error ? reason.message : "無法載入全域設定",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    void window.api
      .getGpuAdapters()
      .then((value) => {
        if (active) setAdapters(value);
      })
      .catch(() => {
        if (active)
          message.warning("無法偵測顯示卡，仍可使用系統自動選擇或保留原設定");
      });
    return () => {
      active = false;
    };
  }, []);

  const save = async (): Promise<void> => {
    const normalized = {
      ...settings,
      jvmArgs: settings.jvmArgs.map((arg) => arg.trim()).filter(Boolean),
    };
    try {
      validateLaunchSettings(normalized);
      setSaving(true);
      setSettings(await window.api.saveGlobalSettings(normalized));
      message.success("全域設定已儲存，將於下次啟動遊戲時套用");
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  };
  const chooseDirectory = async (reset = false): Promise<void> => {
    setDirectoryBusy(true);
    try {
      const value = reset
        ? await window.api.resetDownloadDirectory()
        : await window.api.chooseDownloadDirectory();
      setDownloadDirectory(value.directory);
      setDirectoryError("");
    } catch (reason) {
      setDirectoryError(
        reason instanceof Error ? reason.message : "無法設定下載位置",
      );
    } finally {
      setDirectoryBusy(false);
    }
  };

  return (
    <main className="launcher-page settings-page">
      <div className="page-eyebrow">MAKE IT YOURS</div>
      <div className="settings-heading">
        <div>
          <h1>全域設定</h1>
          <p className="page-description">為所有世界設定共同的啟動偏好。</p>
        </div>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          loading={saving}
          disabled={loading || !!error}
          onClick={() => void save()}
        >
          儲存設定
        </Button>
      </div>
      <section className="launch-setting-section download-settings">
        <h3>下載資料夾</h3>
        <p className="download-directory-path">
          {downloadDirectory || "載入中…"}
        </p>
        <p className="page-description">
          預設使用本機下載資料夾。每個項目會建立獨立子資料夾，包含自動下載及內建瀏覽器下載的檔案；變更僅套用到之後加入的下載。
        </p>
        <div className="download-actions">
          <Button
            icon={<FolderOpenOutlined />}
            loading={directoryBusy}
            onClick={() => void chooseDirectory()}
          >
            變更資料夾
          </Button>
          <Button
            disabled={directoryBusy}
            onClick={() => void chooseDirectory(true)}
          >
            還原本機下載資料夾
          </Button>
        </div>
        {directoryError && <Alert type="error" title={directoryError} />}
      </section>
      <Alert
        type="info"
        showIcon
        title="預設值與強制套用"
        description="新實例會繼承全域預設值；舊實例保留原設定。勾選「強制套用所有實例」可覆蓋該項個別設定；取消強制套用後，原本的自訂值會恢復。變更僅於下次啟動時生效。"
      />
      {error && (
        <Alert className="settings-error" type="error" showIcon title={error} />
      )}
      {loading ? (
        <div className="settings-loading">
          <Spin />
        </div>
      ) : (
        !error && (
          <Form
            layout="vertical"
            className="global-settings-form"
            disabled={saving}
          >
            <LaunchSettingsFields
              disabled={saving}
              value={settings}
              onChange={(value) =>
                setSettings((current) => ({ ...current, ...value }))
              }
              adapters={adapters}
              forced={settings.forcedSettings}
              onForcedChange={(forcedSettings) =>
                setSettings((current) => ({ ...current, forcedSettings }))
              }
            />
          </Form>
        )
      )}
    </main>
  );
}
