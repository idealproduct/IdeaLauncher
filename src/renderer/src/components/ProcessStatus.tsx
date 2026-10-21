import { Tag } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import type { InstanceProcessState } from "../../../shared/launcher";

export default function ProcessStatus({
  state,
}: {
  state?: InstanceProcessState;
}): React.JSX.Element {
  const labels = {
    starting: "正在啟動",
    running: "執行中",
    stopping: "正在停止",
    exited: state?.stopped ? "已停止" : "已結束",
    failed: "啟動／執行失敗",
  };
  const color =
    state?.status === "running"
      ? "green"
      : state?.status === "failed"
        ? "red"
        : state?.status === "starting" || state?.status === "stopping"
          ? "gold"
          : "default";
  return (
    <Tag
      color={color}
      title={state?.error}
      icon={
        state?.status === "starting" || state?.status === "stopping" ? (
          <LoadingOutlined />
        ) : undefined
      }
    >
      {state ? labels[state.status] : "未啟動"}
    </Tag>
  );
}
