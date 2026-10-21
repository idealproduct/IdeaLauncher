import { useState } from "react";
import { Alert, Button, List, Tag, message } from "antd";
import { GlobalOutlined, FolderOpenOutlined } from "@ant-design/icons";
import type { DownloadTask } from "../../../shared/content";

export default function RestrictedDownloads({
  task,
  onOpened,
}: {
  task: DownloadTask;
  onOpened?: () => void;
}): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const missing = task.restrictedFiles.filter((file) => !file.received);
  const openAll = async (): Promise<void> => {
    setBusy(true);
    try {
      await window.api.openRestrictedDownloads(task.id);
      onOpened?.();
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "無法開啟下載視窗",
      );
    } finally {
      setBusy(false);
    }
  };
  const select = async (): Promise<void> => {
    setBusy(true);
    try {
      const result = await window.api.selectDownloadFiles(task.id);
      if (result.matched) message.success(`已驗證 ${result.matched} 個檔案`);
      if (result.rejected.length)
        message.warning(`${result.rejected.length} 個檔案不符合所需版本`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "無法讀取檔案");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="restricted-downloads">
      <Alert
        type="warning"
        showIcon
        title={`共 ${task.restrictedFiles.length} 個檔案不提供外部平台自動下載，尚缺 ${missing.length} 個`}
        description="是否一次開啟所有待下載檔案的 CurseForge 頁面？內建視窗會將下載存到指定資料夾，驗證完成後自動接續安裝。"
      />
      <List
        size="small"
        className="restricted-file-list"
        dataSource={task.restrictedFiles}
        renderItem={(file) => (
          <List.Item
            extra={
              <Tag color={file.received ? "green" : "gold"}>
                {file.received ? "已驗證" : "待下載"}
              </Tag>
            }
          >
            <div>
              <strong>{file.projectName}</strong>
              <p>{file.version}</p>
              <p>{file.fileName}</p>
            </div>
          </List.Item>
        )}
      />
      <div className="download-actions">
        <Button
          type="primary"
          icon={<GlobalOutlined />}
          loading={busy}
          disabled={!missing.length}
          onClick={() => void openAll()}
        >
          一次開啟全部下載（{missing.length}）
        </Button>
        <Button
          icon={<FolderOpenOutlined />}
          disabled={busy || !missing.length}
          onClick={() => void select()}
        >
          批次選取已下載檔案
        </Button>
      </div>
    </div>
  );
}
