import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Pagination,
  Segmented,
  Select,
  Spin,
  Tag,
  message,
} from "antd";
import {
  AppstoreOutlined,
  DownloadOutlined,
  ImportOutlined,
  LinkOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  contentKinds,
  contentLabels,
  isFileCompatible,
  loaderTags,
  type ContentKind,
  type ContentProject,
  type ContentFile,
  type PackPreview,
} from "../../../shared/content";
import {
  isProcessActive,
  type InstanceSummary,
} from "../../../shared/launcher";
import { useProcessStates } from "../hooks/useProcessStates";

const errorText = (error: unknown): string =>
  error instanceof Error
    ? error.message.replace(
        /^Error invoking remote method '[^']+': (?:Error: )?/,
        "",
      )
    : "操作失敗，請稍後重試";

export default function Discover(): React.JSX.Element {
  const navigate = useNavigate();
  const [kind, setKind] = useState<ContentKind>("modpack");
  const [query, setQuery] = useState("");
  const [gameVersion, setGameVersion] = useState("");
  const [loader, setLoader] = useState<InstanceSummary["loader"] | undefined>();
  const [projects, setProjects] = useState<ContentProject[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [configured, setConfigured] = useState<boolean>();
  const [error, setError] = useState("");
  const [selectedProject, setSelectedProject] = useState<ContentProject>();
  const [files, setFiles] = useState<ContentFile[]>([]);
  const [fileTotal, setFileTotal] = useState(0);
  const [filePage, setFilePage] = useState(1);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState("");
  const [fileId, setFileId] = useState<number>();
  const [instances, setInstances] = useState<InstanceSummary[]>([]);
  const [instancesError, setInstancesError] = useState("");
  const [instanceId, setInstanceId] = useState<string>();
  const [preview, setPreview] = useState<PackPreview>();
  const [packName, setPackName] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [installing, setInstalling] = useState(false);
  const searchSequence = useRef(0);
  const filesSequence = useRef(0);
  const {
    states,
    loading: processesLoading,
    error: processesError,
  } = useProcessStates();
  const busy = installing;
  const selectedFile = files.find((file) => file.id === fileId);
  const compatible =
    selectedProject && selectedFile
      ? instances.filter((instance) =>
          isFileCompatible(selectedFile, instance, selectedProject.kind),
        )
      : [];
  const target = compatible.find((instance) => instance.id === instanceId);
  const targetRunning = target && isProcessActive(states[target.id]);
  const notifyQueued = (): void => {
    message.success("已加入背景下載，可在下載中心檢視進度");
  };

  useEffect(() => {
    let active = true;
    void window.api
      .getContentConfiguration()
      .then((value) => {
        if (active) setConfigured(value.configured);
      })
      .catch((reason) => {
        if (active) setError(errorText(reason));
      });
    void window.api
      .getInstances()
      .then((value) => {
        if (active) setInstances(value);
      })
      .catch((reason) => {
        if (active) setInstancesError(errorText(reason));
      });
    return () => {
      active = false;
      searchSequence.current++;
      filesSequence.current++;
    };
  }, []);

  const search = async (nextPage = 1): Promise<void> => {
    const sequence = ++searchSequence.current;
    setLoading(true);
    setError("");
    setPage(nextPage);
    try {
      const result = await window.api.searchContent({
        kind,
        query,
        gameVersion: gameVersion || undefined,
        loader,
        index: (nextPage - 1) * 20,
      });
      if (sequence === searchSequence.current) {
        setProjects(result.data);
        setTotal(result.totalCount);
      }
    } catch (reason) {
      if (sequence === searchSequence.current) {
        setError(errorText(reason));
        setProjects([]);
        setTotal(0);
      }
    } finally {
      if (sequence === searchSequence.current) setLoading(false);
    }
  };

  // Refresh the catalogue when changing content type; text/version filters apply on Search.
  useEffect(() => {
    if (configured) void search(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, configured]);

  const loadFiles = async (
    project: ContentProject,
    nextPage = 1,
  ): Promise<void> => {
    const sequence = ++filesSequence.current;
    setSelectedProject(project);
    setPackName(project.name);
    setFilesLoading(true);
    setFilesError("");
    setFilePage(nextPage);
    setFileId(undefined);
    setInstanceId(undefined);
    setFiles([]);
    try {
      const result = await window.api.getContentFiles({
        projectId: project.id,
        index: (nextPage - 1) * 50,
        gameVersion: gameVersion || undefined,
        loader: project.kind === "mod" ? loader : undefined,
      });
      if (sequence === filesSequence.current) {
        setFiles(result.data);
        setFileTotal(result.totalCount);
      }
    } catch (reason) {
      if (sequence === filesSequence.current) setFilesError(errorText(reason));
    } finally {
      if (sequence === filesSequence.current) setFilesLoading(false);
    }
  };

  const prepare = async (): Promise<void> => {
    setPreparing(true);
    try {
      const value = await window.api.preparePack();
      if (value) {
        setPreview(value);
        setPackName(value.name);
        setSelectedProject(undefined);
      }
    } catch (reason) {
      message.error(errorText(reason));
    } finally {
      setPreparing(false);
    }
  };

  const install = async (): Promise<void> => {
    if (!selectedProject || !selectedFile) return;
    if (selectedProject.kind !== "modpack" && (!target || targetRunning))
      return;
    setInstalling(true);
    try {
      if (selectedProject.kind === "modpack") {
        await window.api.enqueuePack({
          projectId: selectedProject.id,
          fileId: selectedFile.id,
          name: packName.trim(),
        });
      } else {
        await window.api.installContent({
          projectId: selectedProject.id,
          fileId: selectedFile.id,
          instanceId: target!.id,
          name: selectedProject.name,
          kind: selectedProject.kind,
        });
      }
      notifyQueued();
      setSelectedProject(undefined);
    } catch (reason) {
      message.error(errorText(reason));
    } finally {
      setInstalling(false);
    }
  };

  const importPack = async (): Promise<void> => {
    if (!preview || !packName.trim()) return;
    setInstalling(true);
    try {
      await window.api.importPack({
        token: preview.token,
        name: packName.trim(),
      });
      notifyQueued();
      setPreview(undefined);
    } catch (reason) {
      message.error(errorText(reason));
      setPreview(undefined);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <main className="launcher-page discover-page">
      <div className="page-eyebrow">DISCOVER YOUR NEXT WORLD</div>
      <header className="discover-heading">
        <div>
          <h1>探索內容</h1>
          <p className="page-description">
            從 CurseForge 尋找新的玩法，或匯入你的模組包。
          </p>
        </div>
        <div className="download-actions">
          <Button onClick={() => navigate("/downloads")}>下載中心</Button>
          <Button
            icon={<ImportOutlined />}
            loading={preparing}
            disabled={busy}
            onClick={() => void prepare()}
          >
            匯入模組包
          </Button>
        </div>
      </header>
      <Segmented
        className="content-tabs"
        block
        value={kind}
        disabled={busy || preparing}
        onChange={(value) => setKind(value as ContentKind)}
        options={contentKinds.map((value) => ({
          value,
          label: contentLabels[value],
        }))}
      />
      <Form className="content-search" onFinish={() => void search(1)}>
        <Input
          aria-label="搜尋內容"
          prefix={<SearchOutlined />}
          placeholder={`搜尋 CurseForge ${contentLabels[kind]}…`}
          maxLength={200}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Input
          aria-label="Minecraft 版本"
          placeholder="Minecraft 版本，例如 1.21.1"
          value={gameVersion}
          maxLength={60}
          onChange={(event) => setGameVersion(event.target.value)}
        />
        {kind === "mod" && (
          <Select
            aria-label="載入器"
            placeholder="所有載入器"
            allowClear
            value={loader}
            onChange={setLoader}
            options={["forge", "fabric", "neoforge"].map((value) => ({
              value,
              label:
                value === "neoforge"
                  ? "NeoForge"
                  : value === "fabric"
                    ? "Fabric"
                    : "Forge",
            }))}
          />
        )}
        <Button
          type="primary"
          htmlType="submit"
          icon={<SearchOutlined />}
          loading={loading}
          disabled={!configured}
        >
          搜尋
        </Button>
      </Form>
      {configured === false && (
        <Alert
          showIcon
          type="info"
          title="CurseForge 連線尚未設定"
          description="請完成啟動器連線設定後再搜尋。仍可匯入不依賴 CurseForge 的 .mrpack。"
        />
      )}
      {error && <Alert type="error" showIcon title={error} />}
      {loading ? (
        <div className="settings-loading">
          <Spin tip="搜尋中" />
        </div>
      ) : projects.length ? (
        <>
          <div className="content-result-heading">
            <span>{contentLabels[kind]}</span>
            <span>{total.toLocaleString()} 個結果 · CurseForge</span>
          </div>
          <div className="content-grid">
            {projects.map((project) => (
              <article className="content-card" key={project.id}>
                <div className="content-card-header">
                  {project.icon ? (
                    <img
                      className="content-project-icon"
                      src={project.icon}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <AppstoreOutlined className="content-project-fallback" />
                  )}
                  <div>
                    <h2>{project.name}</h2>
                    <p>{project.authors.join(", ")}</p>
                  </div>
                </div>
                <p className="content-summary">{project.summary}</p>
                <div className="content-card-footer">
                  <span>
                    {new Intl.NumberFormat("zh-TW", {
                      notation: "compact",
                    }).format(project.downloads)}{" "}
                    次下載
                  </span>
                  <Button
                    icon={<DownloadOutlined />}
                    disabled={busy || preparing}
                    onClick={() => void loadFiles(project)}
                  >
                    選擇版本
                  </Button>
                </div>
              </article>
            ))}
          </div>
          <Pagination
            className="content-pagination"
            current={page}
            pageSize={20}
            total={Math.min(total, 10000)}
            showSizeChanger={false}
            onChange={(value) => void search(value)}
          />
        </>
      ) : (
        !error &&
        configured && (
          <Empty description="找不到符合條件的內容，請調整關鍵字或 Minecraft 版本。" />
        )
      )}

      <Modal
        title={selectedProject?.name ?? "選擇版本"}
        open={!!selectedProject}
        width={700}
        onCancel={() => {
          if (!busy && !preparing) {
            filesSequence.current++;
            setSelectedProject(undefined);
          }
        }}
        maskClosable={!busy && !preparing}
        closable={!busy && !preparing}
        footer={
          <>
            <Button
              icon={<LinkOutlined />}
              onClick={() =>
                selectedProject &&
                void window.api
                  .openContentProject(selectedProject.id)
                  .catch((reason) => message.error(errorText(reason)))
              }
            >
              CurseForge 專案頁
            </Button>
            <Button
              type="primary"
              loading={busy || preparing}
              disabled={
                !selectedFile ||
                filesLoading ||
                (selectedProject?.kind === "modpack" && !packName.trim()) ||
                (selectedProject?.kind !== "modpack" &&
                  (!target ||
                    !!targetRunning ||
                    processesLoading ||
                    !!processesError))
              }
              onClick={() => void install()}
            >
              {selectedProject?.kind === "modpack"
                ? "安裝為新實例"
                : "安裝至選取實例"}
            </Button>
          </>
        }
      >
        <Form layout="vertical" className="content-install-form">
          {!selectedProject?.available && (
            <Alert
              showIcon
              type="warning"
              title="此作者僅允許手動下載"
              description="安裝時會引導你從官方頁面下載並選取本機檔案，僅接受與選取版本相符的檔案。"
            />
          )}
          {filesError && <Alert showIcon type="error" title={filesError} />}
          <Form.Item label="檔案版本">
            <Select
              loading={filesLoading}
              placeholder="選擇要安裝的檔案版本"
              value={fileId}
              disabled={busy || preparing}
              showSearch
              optionFilterProp="label"
              onChange={(value) => {
                setFileId(value);
                setInstanceId(undefined);
              }}
              options={files.map((file) => ({
                value: file.id,
                label: `${file.displayName} · ${file.gameVersions.filter((version) => /^\d/.test(version) || loaderTags.includes(version)).join(", ")} · ${["", "Release", "Beta", "Alpha"][file.releaseType] ?? ""}`,
              }))}
            />
          </Form.Item>
          {fileTotal > 50 && selectedProject && (
            <Pagination
              size="small"
              current={filePage}
              pageSize={50}
              total={Math.min(fileTotal, 10000)}
              showSizeChanger={false}
              disabled={busy || preparing}
              onChange={(value) => void loadFiles(selectedProject, value)}
            />
          )}
          {selectedFile && (
            <div className="selected-file-info">
              <Tag>{selectedFile.fileName}</Tag>
              <span>
                {(selectedFile.fileLength / 1024 / 1024).toFixed(1)} MB
              </span>
            </div>
          )}
          {selectedProject?.kind === "modpack" && (
            <Form.Item label="新實例名稱">
              <Input
                value={packName}
                maxLength={120}
                onChange={(event) => setPackName(event.target.value)}
              />
            </Form.Item>
          )}
          {selectedProject &&
            selectedProject.kind !== "modpack" &&
            selectedFile && (
              <>
                <Form.Item
                  label="安裝至相容實例"
                  extra="依選取檔案的 Minecraft 版本與模組載入器自動篩選；執行中的實例須先停止。"
                >
                  <Select
                    placeholder={
                      compatible.length ? "選擇目標實例" : "沒有相容的實例"
                    }
                    value={instanceId}
                    disabled={busy || processesLoading || !!processesError}
                    onChange={setInstanceId}
                    options={compatible.map((instance) => ({
                      value: instance.id,
                      label: `${instance.name} · ${instance.minecraftVersion} · ${instance.loader}${isProcessActive(states[instance.id]) ? "（執行中）" : ""}`,
                      disabled: isProcessActive(states[instance.id]),
                    }))}
                  />
                </Form.Item>
                {(instancesError || processesError) && (
                  <Alert
                    showIcon
                    type="error"
                    title={instancesError || processesError}
                  />
                )}
                {!compatible.length && (
                  <Alert
                    showIcon
                    type="info"
                    title="沒有相容實例"
                    description="請先建立符合此檔案版本及載入器的實例，再回來安裝。"
                  />
                )}
                {selectedProject.kind === "shader" && (
                  <Alert
                    type="info"
                    showIcon
                    title="光影需要 Iris 或 OptiFine 等支援"
                    description="安裝會將檔案放入 shaderpacks；請確認實例已具備光影載入支援。"
                  />
                )}
                {selectedProject.kind === "resourcepack" && (
                  <p className="page-description">
                    安裝後請在遊戲的資源包設定中啟用。
                  </p>
                )}
                {selectedProject.kind === "mod" && (
                  <p className="page-description">
                    將一併安裝 CurseForge
                    標記的必要依賴。相容性依檔案發布資訊判斷。
                  </p>
                )}
              </>
            )}
        </Form>
      </Modal>
      <Modal
        title="匯入模組包"
        open={!!preview}
        maskClosable={!busy}
        closable={!busy}
        onCancel={() => {
          if (preview && !busy) {
            void window.api.discardPack(preview.token).catch(() => undefined);
            setPreview(undefined);
          }
        }}
        okText="建立並安裝"
        cancelText="取消"
        confirmLoading={busy}
        okButtonProps={{
          disabled: !packName.trim() || (!!preview?.needsApiKey && !configured),
        }}
        onOk={() => void importPack()}
      >
        {preview && (
          <Form layout="vertical" className="content-install-form">
            <Form.Item label="實例名稱">
              <Input
                value={packName}
                maxLength={120}
                disabled={busy}
                onChange={(event) => setPackName(event.target.value)}
              />
            </Form.Item>
            <div className="pack-preview">
              <Tag>
                {preview.format === "curseforge"
                  ? "CurseForge ZIP"
                  : "Modrinth MRPACK"}
              </Tag>
              <p>
                Minecraft {preview.minecraftVersion} · {preview.loader}{" "}
                {preview.loaderVersion}
              </p>
              <p>{preview.fileCount} 個下載項目，另含包內覆寫檔案</p>
            </div>
            <Alert
              showIcon
              type="info"
              title="建立獨立的新實例"
              description="使用模組包指定的遊戲與載入器版本，不會覆蓋既有實例。安裝完成後可至實例清單啟動。"
            />
            <p className="page-description">
              若包內作者限制自動下載，安裝過程會請你選取從官方頁面下載的對應檔案。
            </p>
            {preview.needsApiKey && !configured && (
              <Alert
                showIcon
                type="warning"
                title="此模組包需要 CurseForge 主程序連線金鑰"
              />
            )}
          </Form>
        )}
      </Modal>
    </main>
  );
}
