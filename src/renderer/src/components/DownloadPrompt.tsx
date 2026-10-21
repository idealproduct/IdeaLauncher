import { useEffect, useRef, useState } from "react";
import { Button, Modal } from "antd";
import { useNavigate } from "react-router-dom";
import type { DownloadTask } from "../../../shared/content";
import RestrictedDownloads from "./RestrictedDownloads";

export default function DownloadPrompt({
  tasks,
}: {
  tasks: DownloadTask[];
}): React.JSX.Element {
  const seen = useRef(new Set<string>());
  const [taskId, setTaskId] = useState<string>();
  const navigate = useNavigate();
  const task = tasks.find(
    (task) => task.id === taskId && task.status === "waiting",
  );
  useEffect(() => {
    if (task) return;
    const next = tasks.find(
      (task) =>
        task.status === "waiting" &&
        !seen.current.has(
          `${task.id}:${task.restrictedFiles.map((file) => file.fileId).join(",")}`,
        ),
    );
    if (next) {
      seen.current.add(
        `${next.id}:${next.restrictedFiles.map((file) => file.fileId).join(",")}`,
      );
      setTaskId(next.id);
    }
  }, [tasks, task]);
  return (
    <Modal
      title="一次下載受限檔案"
      open={!!task}
      width={740}
      onCancel={() => setTaskId(undefined)}
      footer={
        <>
          <Button
            onClick={() => {
              setTaskId(undefined);
              navigate("/downloads");
            }}
          >
            前往下載中心
          </Button>
          <Button onClick={() => setTaskId(undefined)}>稍後處理</Button>
        </>
      }
    >
      {task && (
        <RestrictedDownloads
          task={task}
          onOpened={() => setTaskId(undefined)}
        />
      )}
    </Modal>
  );
}
