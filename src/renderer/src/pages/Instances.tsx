import { useState, useEffect, useRef } from "react";
import { CloseOutlined, FileTextOutlined } from "@ant-design/icons";
import { Button, Checkbox, Form, Input, InputNumber, Modal, Progress, Radio, Select, message } from "antd";
import type { MinecraftVersion } from "@xmcl/installer";

type Instance = Awaited<ReturnType<typeof window.api.getInstances>>[number];
type GpuAdapter = Awaited<ReturnType<typeof window.api.getGpuAdapters>>[number];
type InstanceLog = { instanceId: string; instanceName: string; timestamp: string; message: string };

export default function Instances(): React.JSX.Element {

  // 定義控制新增 Instance 介面（Modal）開關的狀態
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [versions, setVersions] = useState<MinecraftVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [versionType, setVersionType] = useState<'release' | 'snapshot'>('release');
  const [selectedLoader, setSelectedLoader] = useState<'vanilla' | 'forge' | 'fabric' | 'neoforge'>('vanilla');
  const [launchAfterInstall, setLaunchAfterInstall] = useState(true);
  const [isInstalling, setIsInstalling] = useState(false);
  const [instanceName, setInstanceName] = useState<string>('');
  const [progress, setProgress] = useState(0);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [gpuAdapters, setGpuAdapters] = useState<GpuAdapter[]>([]);
  const [isLoadingInstances, setIsLoadingInstances] = useState(true);
  const [selectedInstance, setSelectedInstance] = useState<Instance | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingName, setEditingName] = useState("");
  const [editingMinMemory, setEditingMinMemory] = useState(1024);
  const [editingMaxMemory, setEditingMaxMemory] = useState(4096);
  const [editingJvmArgs, setEditingJvmArgs] = useState("");
  const [editingJavaPath, setEditingJavaPath] = useState("");
  const [editingGpuAdapter, setEditingGpuAdapter] = useState<string | undefined>(undefined);
  const [editingOfflineMode, setEditingOfflineMode] = useState(false);
  const [editingOfflineUsername, setEditingOfflineUsername] = useState("");
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isDeletingInstance, setIsDeletingInstance] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [launchingInstanceId, setLaunchingInstanceId] = useState<string | null>(null);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [autoScrollLogs, setAutoScrollLogs] = useState(true);
  const [logTabsByInstance, setLogTabsByInstance] = useState<Record<string, { instanceName: string; logs: InstanceLog[] }>>({});
  const [activeLogTabId, setActiveLogTabId] = useState<string>();
  const [logPosition, setLogPosition] = useState({ x: 0, y: 0 });
  const logOutputRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef({ active: false, startX: 0, startY: 0, originX: 0, originY: 0 });

  const fetchInstances = async (): Promise<void> => {
    try {
      setInstances(await window.api.getInstances());
    } catch (error) {
      console.error("Failed to load instances in renderer:", error);
      message.error("無法載入 Instance 清單");
    } finally {
      setIsLoadingInstances(false);
    }
  };

  useEffect(() => {
    async function fetchVersions(): Promise<void> {
      try {
        // 透過 preload 暴露的 api 取得資料
        const result = await window.api.getMinecraftVersions();
        console.log('Fetched versions result:', result);
        window.api.onInstanceInstallProgress(setProgress);
        if (result.success) {
          const data = result.data;
          setVersions(data);
          console.log('Parsed versions length:', data.length);
          console.log('Fetched versions:', result.data);
        }
      } catch (error) {
        console.error("Failed to load versions in renderer:", error);

      }
    }

    fetchVersions();
    void Promise.resolve().then(fetchInstances);
    void window.api.getGpuAdapters().then(setGpuAdapters).catch((error: unknown) => {
      console.error("Failed to load GPU adapters in renderer:", error);
      message.error("無法載入 GPU 清單");
    });
    return window.api.onInstanceLog((log) => {
      setLogTabsByInstance((current) => {
        const tab = current[log.instanceId];
        return {
          ...current,
          [log.instanceId]: {
            instanceName: log.instanceName,
            logs: [...(tab?.logs ?? []), log].slice(-500),
          },
        };
      });
      setActiveLogTabId((current) => current ?? log.instanceId);
    });
  }, []);

  const logTabEntries = Object.entries(logTabsByInstance);
  const selectedLogTabId = activeLogTabId ?? logTabEntries[0]?.[0];
  const selectedLogTab = selectedLogTabId ? logTabsByInstance[selectedLogTabId] : undefined;
  const selectedLogs = selectedLogTab?.logs ?? [];

  const closeLogTab = (instanceId: string): void => {
    const remainingEntries = logTabEntries.filter(([id]) => id !== instanceId);
    setLogTabsByInstance((current) => {
      const next = { ...current };
      delete next[instanceId];
      return next;
    });
    if (selectedLogTabId === instanceId) {
      setActiveLogTabId(remainingEntries[0]?.[0]);
    }
  };

  useEffect(() => {
    const output = logOutputRef.current;
    if (autoScrollLogs && output) output.scrollTop = output.scrollHeight;
  }, [autoScrollLogs, selectedLogTabId, selectedLogs, isLogOpen]);

  // 點擊「新增 Instance」按鈕時開啟
  const showModal = (): void => {
    setIsModalOpen(true);
  };

  // 點擊確定或取消時關閉
  const handleCancel = (): void => {
    setIsModalOpen(false);
  };

  const handleOk = async (): Promise<void> => {
    // 這裡可以處理送出新增 Instance 的邏輯
    if (!instanceName.trim() || !selectedVersion) {
      message.warning('請輸入 Instance 名稱並選擇 Minecraft 版本');
      return;
    }

    setIsInstalling(true);
    setProgress(0);
    try {
      await window.api.createInstance({
        name: instanceName,
        version: selectedVersion,
        loader: selectedLoader,
        launchAfterInstall,
      });
      await fetchInstances();
      message.success(launchAfterInstall ? '安裝完成，Minecraft 已啟動' : 'Instance 安裝完成');
      setIsModalOpen(false);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '安裝 Minecraft 失敗');
    } finally {
      setIsInstalling(false);
    }
  };

  const openInstanceSettings = (instance: Instance): void => {
    setSelectedInstance(instance);
    setEditingName(instance.name);
    setEditingMinMemory(instance.minMemory);
    setEditingMaxMemory(instance.maxMemory);
    setEditingJvmArgs(instance.jvmArgs.join("\n"));
    setEditingJavaPath(instance.javaPathOverride ?? "");
    setEditingGpuAdapter(instance.gpuAdapter);
    setEditingOfflineMode(instance.offlineMode);
    setEditingOfflineUsername(instance.offlineUsername ?? "");
    setIsSettingsOpen(true);
  };

  const handleLaunch = async (instanceId: string): Promise<void> => {
    setLaunchingInstanceId(instanceId);
    try {
      await window.api.launchInstance(instanceId);
      message.success("Minecraft 已啟動");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "啟動 Minecraft 失敗");
    } finally {
      setLaunchingInstanceId(null);
    }
  };

  const handleSaveSettings = async (): Promise<void> => {
    if (!selectedInstance || !editingName.trim()) {
      message.warning("請輸入 Instance 名稱");
      return;
    }
    if (editingMinMemory < 256 || editingMaxMemory < editingMinMemory || editingMaxMemory > 65536) {
      message.warning("記憶體必須介於 256 MB 至 65536 MB，且最大值不可小於最小值");
      return;
    }

    setIsSavingSettings(true);
    try {
      await window.api.updateInstance({
        id: selectedInstance.id,
        name: editingName,
        minMemory: editingMinMemory,
        maxMemory: editingMaxMemory,
        jvmArgs: editingJvmArgs.split(/\r?\n/).map((arg) => arg.trim()).filter(Boolean),
        javaPathOverride: editingJavaPath.trim() || undefined,
        gpuAdapter: editingGpuAdapter,
        offlineMode: editingOfflineMode,
        offlineUsername: editingOfflineUsername.trim() || undefined,
      });
      await fetchInstances();
      setIsSettingsOpen(false);
      message.success("Instance 設定已儲存");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "儲存 Instance 設定失敗");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleDeleteInstance = async (deleteFiles: boolean): Promise<void> => {
    if (!selectedInstance) return;

    setIsDeletingInstance(true);
    try {
      await window.api.deleteInstance(selectedInstance.id, deleteFiles);
      await fetchInstances();
      setIsSettingsOpen(false);
      setIsDeleteConfirmOpen(false);
      setSelectedInstance(null);
      message.success("Instance 已刪除");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "刪除 Instance 失敗");
    } finally {
      setIsDeletingInstance(false);
    }
  };

  const confirmDeleteInstance = (): void => {
    setIsDeleteConfirmOpen(true);
  };

  const filteredVersions = versions.filter((v) => v.type === versionType);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent): void => {
      if (!dragState.current.active) return;
      setLogPosition({
        x: dragState.current.originX + event.clientX - dragState.current.startX,
        y: dragState.current.originY + event.clientY - dragState.current.startY,
      });
    };
    const handlePointerUp = (): void => {
      dragState.current.active = false;
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  const startLogDrag = (event: React.PointerEvent<HTMLElement>): void => {
    if ((event.target as HTMLElement).closest("button")) return;
    dragState.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      originX: logPosition.x,
      originY: logPosition.y,
    };
  };

  return (
    <main className="min-h-screen text-slate-100 p-6">

      {/* <!-- 頁面標題 --> */}
      <header className="relative mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Instance List</h1>
          <p className="text-slate-400 text-sm">Click the Instance to get information</p>
        </div>
        <div className="relative mt-10 flex items-start gap-2">
          {isLogOpen && (
            <section
              className="fixed right-4 top-20 z-[1100] flex h-72 w-[min(680px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-950/75 text-left shadow-2xl shadow-black/40 backdrop-blur"
              style={{ transform: `translate(${logPosition.x}px, ${logPosition.y}px)` }}
            >
              <header
                onPointerDown={startLogDrag}
                className="flex cursor-move select-none items-center justify-between border-b border-slate-800 px-3 py-2 text-xs text-slate-300"
              >
                <span>Instance 日誌</span>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">{selectedLogs.length} 行</span>
                  <label className="flex cursor-pointer items-center gap-1.5 text-white">
                    <input
                      type="checkbox"
                      checked={autoScrollLogs}
                      onChange={(event) => setAutoScrollLogs(event.target.checked)}
                      className="accent-indigo-500"
                    />
                    自動捲動
                  </label>
                  <Button
                    type="text"
                    size="small"
                    onClick={() => {
                      if (!selectedLogTabId) return;
                      setLogTabsByInstance((current) => ({
                        ...current,
                        [selectedLogTabId]: {
                          ...current[selectedLogTabId],
                          logs: [],
                        },
                      }));
                    }}
                    className="font-medium text-amber-300 hover:bg-amber-400/15 hover:text-amber-200"
                  >清除</Button>
                </div>
              </header>
              <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-800 px-2 pt-1">
                {logTabEntries.map(([instanceId, tab]) => (
                  <div
                    key={instanceId}
                    className={`flex max-w-48 shrink-0 items-center rounded-t-md text-xs transition-colors ${instanceId === selectedLogTabId
                      ? "bg-slate-800 text-white"
                      : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                      }`}
                    title={tab.instanceName}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveLogTabId(instanceId)}
                      className="min-w-0 truncate px-3 py-1.5 text-left"
                    >
                      {tab.instanceName}
                    </button>
                    <button
                      type="button"
                      aria-label={`關閉 ${tab.instanceName} 日誌分頁`}
                      title="關閉分頁"
                      onClick={() => closeLogTab(instanceId)}
                      className="mr-1 rounded p-1 text-slate-500 hover:bg-slate-700 hover:text-white"
                    >
                      <CloseOutlined className="text-[10px]" />
                    </button>
                  </div>
                ))}
              </div>
              <div ref={logOutputRef} className="min-h-0 flex-1 overflow-auto px-3 py-2 font-mono text-[11px] leading-5 text-slate-300">
                {selectedLogs.length === 0 ? (
                  <p className="text-slate-500">尚無 Instance 安裝或啟動日誌</p>
                ) : selectedLogs.map((log, index) => (
                  <div key={`${log.timestamp}-${index}`} className="whitespace-pre-wrap break-all">
                    <span className="mr-2 text-slate-600">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    {log.message}
                  </div>
                ))}
              </div>
            </section>
          )}
          <button
            type="button"
            aria-expanded={isLogOpen}
            onClick={() => setIsLogOpen((open) => !open)}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-500/20 transition-all hover:bg-indigo-500 active:scale-95"
          >
            <FileTextOutlined className="h-4 w-4" />
            {isLogOpen ? "關閉日誌" : "開啟日誌"}
          </button>
          <button onClick={showModal} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-500/20 transition-all hover:bg-indigo-500 active:scale-95 flex items-center gap-2">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            新增 Instance
          </button>
        </div>
      </header>

      {/* <!-- Card Grid 容器 --> */}
      {isLoadingInstances ? (
        <p className="py-12 text-center text-sm text-slate-400">載入 Instance 中...</p>
      ) : instances.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 px-6 py-12 text-center">
          <p className="text-sm text-slate-400">目前沒有 Instance</p>
          <p className="mt-1 text-xs text-slate-500">點擊右上角「新增 Instance」開始建立。</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {instances.map((instance) => (
            <article
              key={instance.id}
              className="group relative flex min-h-52 cursor-pointer flex-col justify-between overflow-hidden rounded-xl border border-slate-800 bg-slate-800/50 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-slate-700 hover:shadow-xl hover:shadow-indigo-500/10"
              onClick={() => openInstanceSettings(instance)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") openInstanceSettings(instance);
              }}
              role="button"
              tabIndex={0}
            >
              <div>
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-600/20 text-indigo-400 transition-colors group-hover:bg-indigo-600 group-hover:text-white">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="min-w-0 truncate text-lg font-semibold text-white" title={instance.name}>{instance.name}</h2>
                  <span className="shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">Ready</span>
                </div>
                <dl className="mt-3 space-y-1 text-sm text-slate-400">
                  <div className="flex justify-between gap-4"><dt>Minecraft</dt><dd className="text-slate-200">{instance.minecraftVersion}</dd></div>
                  <div className="flex justify-between gap-4"><dt>Loader</dt><dd className="capitalize text-slate-200">{instance.loader}</dd></div>
                  <div className="flex justify-between gap-4"><dt>Java</dt><dd className="text-slate-200">{instance.javaMajorVersion} {instance.javaPathOverride ? "(覆寫)" : "(自動)"}</dd></div>
                  <div className="flex justify-between gap-4"><dt>模式</dt><dd className="text-slate-200">{instance.offlineMode ? "離線" : "線上"}</dd></div>
                </dl>
              </div>
              <div className="mt-6 flex items-center justify-end border-t border-slate-700/50 pt-4">
                <button
                  type="button"
                  disabled={launchingInstanceId === instance.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleLaunch(instance.id);
                  }}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-wait disabled:opacity-60"
                >
                  {launchingInstanceId === instance.id ? "啟動中..." : "啟動"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* 3. 新增 Instance 的彈跳視窗介面 (Modal) */}
      <Modal
        title={<span className="text-white">新增 Instance</span>}
        open={isModalOpen}
        onOk={handleOk}
        onCancel={handleCancel}
        confirmLoading={isInstalling}
        okText="確認新增"
        cancelText="取消"
        className="dark-modal"
      >
        <div className="py-4">
          <Form layout="vertical">
            <Form.Item label={<span className="text-slate-300">Instance 名稱</span>}>
              <Input placeholder="請輸入 Instance 名稱" value={instanceName} onChange={(e) => setInstanceName(e.target.value)} className="bg-slate-800 text-white border-slate-700" />
            </Form.Item>
            <Form.Item label={<span className="text-slate-300">Minecraft 版本</span>}>
              <Radio.Group
                value={versionType}
                onChange={(event) => {
                  const nextVersionType = event.target.value as 'release' | 'snapshot';
                  if (nextVersionType === 'snapshot' && selectedLoader !== 'vanilla') {
                    message.warning('Forge、Fabric 與 NeoForge 僅支援 Release 版本');
                    return;
                  }
                  setVersionType(nextVersionType);
                  setSelectedVersion(null);
                }}
                optionType="button"
                buttonStyle="solid"
                options={[
                  { label: 'Release', value: 'release' },
                  { label: 'Snapshot', value: 'snapshot' }
                ]}
                className="mb-3"
              />
              <Select
                value={selectedVersion || undefined}
                options={filteredVersions.map(v => ({ value: String(v.id), label: String(v.id ?? '') }))}
                placeholder="選擇 Minecraft 版本"
                onChange={(value) => setSelectedVersion(value as string)}
                style={{ width: '100%' }}
              />
            </Form.Item>
            <Form.Item label={<span className="text-slate-300">Mod Loader</span>}>
              <Radio.Group
                value={selectedLoader}
                onChange={(event) => {
                  const loader = event.target.value as 'vanilla' | 'forge' | 'fabric' | 'neoforge';
                  setSelectedLoader(loader);
                  if (loader !== 'vanilla' && versionType !== 'release') {
                    setVersionType('release');
                    setSelectedVersion(null);
                  }
                }}
                options={[
                  { label: 'Vanilla', value: 'vanilla' },
                  { label: 'Forge', value: 'forge' },
                  { label: 'Fabric', value: 'fabric' },
                  { label: 'NeoForge', value: 'neoforge' },
                ]}
              />
              {selectedLoader !== 'vanilla' && (
                <p className="mt-2 text-xs text-slate-400">Forge、Fabric 與 NeoForge 僅支援 Release 版本。</p>
              )}
            </Form.Item>
            <Checkbox checked={launchAfterInstall} onChange={(event) => setLaunchAfterInstall(event.target.checked)}>
              安裝完成後立即啟動 Minecraft
            </Checkbox>
            <button
              type="button"
              aria-expanded={isLogOpen}
              onClick={() => setIsLogOpen((open) => !open)}
              className="mt-4 flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-500/20 transition-all hover:bg-indigo-500 active:scale-95"
            >
              <FileTextOutlined className="h-4 w-4" />
              {isLogOpen ? "關閉日誌" : "開啟日誌"}
            </button>
          </Form>
          <Progress percent={progress} style={{ marginTop: 16 }} />
        </div>
      </Modal>

      <Modal
        title={<span className="text-white">Instance 設定</span>}
        open={isSettingsOpen}
        onOk={() => void handleSaveSettings()}
        onCancel={() => setIsSettingsOpen(false)}
        confirmLoading={isSavingSettings}
        okText="儲存設定"
        cancelText="取消"
        className="dark-modal"
      >
        <div className="space-y-4 py-4">
          <Form layout="vertical">
            <Form.Item label={<span className="text-slate-300">Instance 名稱</span>}>
              <Input value={editingName} onChange={(event) => setEditingName(event.target.value)} />
            </Form.Item>
            <div className="grid grid-cols-2 gap-4">
              <Form.Item label={<span className="text-slate-300">最小記憶體 (MB)</span>}>
                <InputNumber min={256} max={65536} value={editingMinMemory} onChange={(value) => setEditingMinMemory(value ?? 256)} className="w-full" />
              </Form.Item>
              <Form.Item label={<span className="text-slate-300">最大記憶體 (MB)</span>}>
                <InputNumber min={256} max={65536} value={editingMaxMemory} onChange={(value) => setEditingMaxMemory(value ?? 4096)} className="w-full" />
              </Form.Item>
            </div>
            <Form.Item label={<span className="text-slate-300">自訂 JVM arguments</span>}>
              <Input.TextArea
                rows={6}
                value={editingJvmArgs}
                onChange={(event) => setEditingJvmArgs(event.target.value)}
                placeholder="每行輸入一個參數，例如：\n-Dfile.encoding=UTF-8\n-XX:+UseG1GC"
              />
            </Form.Item>
            <Form.Item label={<span className="text-slate-300">Java 路徑覆寫</span>} extra={`留空會自動尋找 Java ${selectedInstance?.javaMajorVersion ?? ""}。請填入 java${navigator.platform.includes("Win") ? ".exe" : ""} 的完整路徑。`}>
              <Input
                value={editingJavaPath}
                onChange={(event) => setEditingJavaPath(event.target.value)}
                placeholder="例如：C:\\Program Files\\Java\\jdk-21\\bin\\java.exe"
              />
            </Form.Item>
            <Checkbox checked={editingOfflineMode} onChange={(event) => setEditingOfflineMode(event.target.checked)}>
              離線模式（不需要登入 Microsoft 帳號）
            </Checkbox>
            {editingOfflineMode && (
              <Form.Item label={<span className="text-slate-300">離線玩家名稱</span>} extra="3-16 個英數字或底線；留空會使用 Instance 名稱。">
                <Input
                  value={editingOfflineUsername}
                  maxLength={16}
                  onChange={(event) => setEditingOfflineUsername(event.target.value)}
                  placeholder="例如：Steve_123"
                />
              </Form.Item>
            )}
            <Form.Item label={<span className="text-slate-300">使用 GPU</span>} extra="預設由系統自動選擇；選定後會套用到此 Instance 的 Minecraft 啟動。">
              <Select
                allowClear
                value={editingGpuAdapter}
                placeholder="系統自動選擇"
                options={gpuAdapters.map((adapter) => ({
                  value: adapter.id,
                  label: `${adapter.name}`,
                }))}
                onChange={(value) => setEditingGpuAdapter(value as string | undefined)}
                notFoundContent="找不到 GPU"
                className="w-full"
              />
            </Form.Item>
          </Form>
          <Button danger loading={isDeletingInstance} onClick={confirmDeleteInstance}>
            刪除 Instance
          </Button>
        </div>
      </Modal>

      <Modal
        title={<span className="text-white">刪除 Instance</span>}
        open={isDeleteConfirmOpen}
        onCancel={() => setIsDeleteConfirmOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setIsDeleteConfirmOpen(false)}>
            取消
          </Button>,
          <Button
            key="keep"
            danger
            loading={isDeletingInstance}
            onClick={() => void handleDeleteInstance(false)}
          >
            刪除並保留資料夾
          </Button>,
          <Button
            key="delete"
            danger
            type="primary"
            loading={isDeletingInstance}
            onClick={() => void handleDeleteInstance(true)}
          >
            刪除並刪除資料夾
          </Button>,
        ]}
        className="dark-modal"
      >
        <p className="text-slate-300">
          確定要刪除「{selectedInstance?.name ?? ""}」嗎？請選擇是否保留 Instance 資料夾。
        </p>
      </Modal>

    </main>
  );
}
