import { useEffect, useState } from "react";
import { Alert, Button, Empty, Progress, Tag, message } from "antd";
import { FolderOpenOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import {
  contentLabels,
  isDownloadActive,
  type DownloadStatus,
} from "../../../shared/content";
import { useDownloads } from "../hooks/useDownloads";
import RestrictedDownloads from "../components/RestrictedDownloads";

const labels: Record<DownloadStatus, string> = {
  queued: "排隊中",
  preparing: "正在檢查",
  downloading: "下載中",
  installing: "安裝中",
  waiting: "等待手動下載",
  complete: "已完成",
  failed: "失敗",
};
const bytes = (value: number): string =>
  value >= 1024 ** 3
    ? `${(value / 1024 ** 3).toFixed(2)} GB`
    : `${(value / 1024 ** 2).toFixed(1)} MB`;

export default function Downloads(): React.JSX.Element {
  const { tasks, error } = useDownloads();
  const [directory, setDirectory] = useState("");
  useEffect(() => {
    void window.api
      .getDownloadSettings()
      .then((value) => setDirectory(value.directory))
      .catch(() => undefined);
  }, []);
  const open = (id?: string): void => {
    void window.api
      .openDownloadDirectory(id)
      .catch((reason) =>
        message.error(
          reason instanceof Error ? reason.message : "無法開啟資料夾",
        ),
      );
  };
  return (
    <main className="launcher-page downloads-page">
      <div className="page-eyebrow">KEEP YOUR ADVENTURES MOVING</div>
      <header className="discover-heading">
        <div>
          <h1>下載中心</h1>
          <p className="page-description">
            {tasks.filter(isDownloadActive).length} 個處理中項目 ·
            切換頁面不影響下載
          </p>
        </div>
        <Button icon={<FolderOpenOutlined />} onClick={() => open()}>
          開啟下載資料夾
        </Button>
      </header>
      <div className="download-location">
        <span>{directory}</span>
        <Link to="/settings">變更下載位置 →</Link>
      </div>
      {error && <Alert type="error" showIcon title={error} />}
      {!tasks.length && (
        <Empty description="尚無下載項目">
          <Link className="text-link" to="/discover">
            前往探索內容
          </Link>
        </Empty>
      )}
      <div className="download-task-list">
        {[...tasks].reverse().map((task) => (
          <article key={task.id} className="download-task">
            <header>
              <div>
                <Tag>{contentLabels[task.kind]}</Tag>
                <h2>{task.name}</h2>
              </div>
              <Tag
                color={
                  task.status === "complete"
                    ? "green"
                    : task.status === "failed"
                      ? "red"
                      : task.status === "waiting"
                        ? "gold"
                        : "cyan"
                }
              >
                {labels[task.status]}
              </Tag>
            </header>
            <p className="download-message" aria-live="polite">
              {task.message}
            </p>
            <Progress
              percent={Math.round(task.percent)}
              status={
                task.status === "failed"
                  ? "exception"
                  : task.status === "complete"
                    ? "success"
                    : task.status === "waiting" || task.status === "queued"
                      ? "normal"
                      : "active"
              }
            />
            <div className="download-metrics">
              <span>
                {bytes(task.downloadedBytes)} /{" "}
                {task.totalBytes ? bytes(task.totalBytes) : "計算中"}
              </span>
              <span>
                {task.completedFiles} / {task.totalFiles || "—"} 個內容檔案
              </span>
            </div>
            {task.currentFile && (
              <p className="download-current-file">{task.currentFile}</p>
            )}
            {task.status === "waiting" && <RestrictedDownloads task={task} />}
            <footer>
              <span>{task.directory ?? "等待建立下載資料夾"}</span>
              <div className="download-actions">
                {task.directory && (
                  <Button size="small" onClick={() => open(task.id)}>
                    開啟資料夾
                  </Button>
                )}
                {task.status === "complete" && task.instanceId && (
                  <Link className="text-link" to="/instances">
                    前往實例 →
                  </Link>
                )}
              </div>
            </footer>
          </article>
        ))}
      </div>
    </main>
  );
}
