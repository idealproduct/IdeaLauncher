import { Checkbox, Form, Input, InputNumber, Select, Tag } from "antd";
import type {
  GlobalSettings,
  GpuAdapterSummary,
  LaunchSettings,
  SettingKey,
} from "../../../shared/launcher";

interface Props {
  value: LaunchSettings;
  onChange: (value: LaunchSettings) => void;
  adapters: GpuAdapterSummary[];
  global?: GlobalSettings;
  inherited?: SettingKey[];
  onInheritedChange?: (keys: SettingKey[]) => void;
  forced?: SettingKey[];
  onForcedChange?: (keys: SettingKey[]) => void;
  disabled?: boolean;
}

export default function LaunchSettingsFields(props: Props): React.JSX.Element {
  const {
    value,
    onChange,
    adapters,
    global,
    inherited = [],
    onInheritedChange,
    forced = [],
    onForcedChange,
    disabled = false,
  } = props;
  const isForced = (key: SettingKey): boolean =>
    !!global?.forcedSettings.includes(key);
  const usesGlobal = (key: SettingKey): boolean =>
    !!global && (inherited.includes(key) || isForced(key));
  const sourceControl = (key: SettingKey): React.JSX.Element => (
    <div className="setting-source">
      {onInheritedChange && (
        <Select
          aria-label="設定來源"
          value={
            isForced(key) || inherited.includes(key) ? "default" : "custom"
          }
          disabled={disabled || isForced(key)}
          onChange={(source) =>
            onInheritedChange(
              source === "default"
                ? [...new Set([...inherited, key])]
                : inherited.filter((item) => item !== key),
            )
          }
          options={[
            { value: "default", label: "預設值（全域設定）" },
            { value: "custom", label: "此實例自訂" },
          ]}
        />
      )}
      {isForced(key) && <Tag color="gold">由全域設定強制套用</Tag>}
      {onForcedChange && (
        <Checkbox
          disabled={disabled}
          checked={forced.includes(key)}
          onChange={(event) =>
            onForcedChange(
              event.target.checked
                ? [...new Set([...forced, key])]
                : forced.filter((item) => item !== key),
            )
          }
        >
          強制套用所有實例
        </Checkbox>
      )}
    </div>
  );
  const current = (key: SettingKey): LaunchSettings =>
    usesGlobal(key) ? global! : value;
  const update = (patch: Partial<LaunchSettings>): void =>
    onChange({ ...value, ...patch });

  return (
    <>
      <section className="launch-setting-section">
        <h3>記憶體</h3>
        {sourceControl("memory")}
        <div className="memory-fields">
          <Form.Item label="最小記憶體 (MB)">
            <InputNumber
              min={256}
              max={65536}
              value={current("memory").minMemory}
              disabled={disabled || usesGlobal("memory")}
              onChange={(number) => update({ minMemory: number ?? 256 })}
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item label="最大記憶體 (MB)">
            <InputNumber
              min={256}
              max={65536}
              value={current("memory").maxMemory}
              disabled={disabled || usesGlobal("memory")}
              onChange={(number) => update({ maxMemory: number ?? 4096 })}
              style={{ width: "100%" }}
            />
          </Form.Item>
        </div>
      </section>
      <section className="launch-setting-section">
        <h3>顯示卡</h3>
        {sourceControl("gpuAdapter")}
        <Form.Item
          label="使用 GPU"
          extra="顯示卡偏好目前僅支援 Windows；共用同一 Java 路徑的實例會共用該路徑的 GPU 偏好。"
        >
          <Select
            style={{ width: "100%" }}
            value={current("gpuAdapter").gpuAdapter ?? "auto"}
            disabled={disabled || usesGlobal("gpuAdapter")}
            onChange={(adapter) =>
              update({ gpuAdapter: adapter === "auto" ? undefined : adapter })
            }
            options={[
              { value: "auto", label: "系統自動選擇" },
              ...adapters.map((adapter) => ({
                value: adapter.id,
                label: adapter.name,
              })),
              ...(current("gpuAdapter").gpuAdapter &&
              !adapters.some(
                (adapter) => adapter.id === current("gpuAdapter").gpuAdapter,
              )
                ? [
                    {
                      value: current("gpuAdapter").gpuAdapter!,
                      label: `未偵測到的 GPU (${current("gpuAdapter").gpuAdapter})`,
                    },
                  ]
                : []),
            ]}
          />
        </Form.Item>
      </section>
      <section className="launch-setting-section">
        <h3>Java 執行環境</h3>
        {sourceControl("javaPathOverride")}
        <Form.Item
          label="Java 路徑"
          extra="留空會依 Minecraft 版本自動尋找 Java。自訂路徑仍須符合該遊戲所需的 Java 版本。"
        >
          <Input
            value={current("javaPathOverride").javaPathOverride ?? ""}
            disabled={disabled || usesGlobal("javaPathOverride")}
            onChange={(event) =>
              update({ javaPathOverride: event.target.value })
            }
            placeholder="自動選擇相容的 Java"
          />
        </Form.Item>
      </section>
      <section className="launch-setting-section">
        <h3>JVM 參數</h3>
        {sourceControl("jvmArgs")}
        <Form.Item label="自訂 JVM arguments" extra="每行輸入一個參數。">
          <Input.TextArea
            rows={5}
            value={current("jvmArgs").jvmArgs.join("\n")}
            disabled={disabled || usesGlobal("jvmArgs")}
            onChange={(event) =>
              update({ jvmArgs: event.target.value.split(/\r?\n/) })
            }
            placeholder="-Dfile.encoding=UTF-8"
          />
        </Form.Item>
      </section>
    </>
  );
}
