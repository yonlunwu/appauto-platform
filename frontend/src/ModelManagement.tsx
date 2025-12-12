import { useEffect, useState } from "react";
import {
  checkModelHealth,
  fetchModelInstances,
  launchModel,
  scanModels,
  stopModelInstance,
} from "./api";
import {
  ModelInfo,
  ModelInstanceResponse,
  SSHConfig,
} from "./types";

interface ModelManagementProps {
  sshConfig: SSHConfig | null;
}

export function ModelManagement({ sshConfig }: ModelManagementProps) {
  const [instances, setInstances] = useState<ModelInstanceResponse[]>([]);
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 启动模型表单
  const [launchForm, setLaunchForm] = useState({
    model_name: "",
    model_path: "",  // 完整路径
    use_custom_path: false,  // 是否使用自定义路径
    engine: "vllm",
    tp: 1,
    mode: "correct",
    port: 30000,
  });

  const [scanBaseDir, setScanBaseDir] = useState("/mnt/data/models");

  useEffect(() => {
    loadInstances();
    const timer = setInterval(loadInstances, 10000); // 每10秒刷新
    return () => clearInterval(timer);
  }, []);

  async function loadInstances() {
    try {
      const data = await fetchModelInstances();
      setInstances(data.instances);
    } catch (err) {
      console.error("Failed to load instances:", err);
    }
  }

  async function handleScanModels() {
    if (!sshConfig) {
      setError("请先配置 SSH 连接");
      return;
    }

    setScanning(true);
    setError(null);
    setMessage(null);

    try {
      const result = await scanModels({
        ssh_config: sshConfig,
        base_dir: scanBaseDir,
        include_hidden: false,
      });

      setAvailableModels(result.models);
      setMessage(`扫描完成，找到 ${result.total} 个模型`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "扫描失败");
    } finally {
      setScanning(false);
    }
  }

  async function handleLaunchModel() {
    if (!launchForm.model_name && !launchForm.use_custom_path) {
      setError("请选择或输入模型");
      return;
    }

    setLaunching(true);
    setError(null);
    setMessage(null);

    try {
      const payload = {
        model_name: launchForm.model_name,
        model_path: launchForm.use_custom_path ? launchForm.model_path : null,
        engine: launchForm.engine,
        tp: launchForm.tp,
        mode: launchForm.mode,
        port: launchForm.port,
        ssh_config: sshConfig,
      };

      const result = await launchModel(payload);
      setMessage(result.message);
      await loadInstances();

      // 重置表单
      setLaunchForm({
        ...launchForm,
        model_path: "",
        use_custom_path: false,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "启动失败");
    } finally {
      setLaunching(false);
    }
  }

  async function handleStopModel(instanceId: number) {
    if (!confirm("确认停止此模型实例？")) return;

    try {
      await stopModelInstance(instanceId);
      setMessage("模型已停止");
      await loadInstances();
    } catch (err) {
      setError(err instanceof Error ? err.message : "停止失败");
    }
  }

  async function handleHealthCheck(instanceId: number) {
    try {
      const result = await checkModelHealth(instanceId);
      if (result.healthy) {
        setMessage(`实例 ${instanceId} 健康检查通过`);
      } else {
        setError(
          `实例 ${instanceId} 健康检查失败: ${result.error || "未知错误"}`,
        );
      }
      await loadInstances();
    } catch (err) {
      setError(err instanceof Error ? err.message : "健康检查失败");
    }
  }

  function getStatusBadge(status: string) {
    const statusColors: Record<string, string> = {
      running: "🟢",
      loading: "🟡",
      pending: "⚪",
      stopped: "⚫",
      error: "🔴",
      health_check_failed: "🟠",
    };
    return statusColors[status] || "⚪";
  }

  return (
    <div>
      <section className="panel">
        <h2>扫描远程模型</h2>

        <div className="form-grid">
          <label>
            扫描目录
            <input
              value={scanBaseDir}
              onChange={(e) => setScanBaseDir(e.target.value)}
              placeholder="/mnt/data/models"
            />
          </label>
        </div>

        <div className="actions">
          <button
            onClick={handleScanModels}
            disabled={scanning || !sshConfig}
            className="secondary"
          >
            {scanning ? "扫描中..." : "扫描模型"}
          </button>
          {!sshConfig && <span className="hint">请先配置 SSH 连接</span>}
        </div>

        {availableModels.length > 0 && (
          <div style={{ marginTop: "1rem" }}>
            <h3>可用模型 ({availableModels.length})</h3>
            <table>
              <thead>
                <tr>
                  <th>模型名称</th>
                  <th>路径</th>
                  <th>大小 (GB)</th>
                </tr>
              </thead>
              <tbody>
                {availableModels.map((model, idx) => (
                  <tr key={idx}>
                    <td>{model.name}</td>
                    <td>
                      <small>{model.path}</small>
                    </td>
                    <td>{model.size_gb?.toFixed(2) || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>启动模型</h2>

        <div className="form-grid">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={launchForm.use_custom_path}
              onChange={(e) =>
                setLaunchForm({
                  ...launchForm,
                  use_custom_path: e.target.checked,
                })
              }
            />
            使用自定义完整路径
          </label>
        </div>

        <div className="form-grid">
          {launchForm.use_custom_path ? (
            <label>
              模型完整路径
              <input
                value={launchForm.model_path}
                onChange={(e) =>
                  setLaunchForm({ ...launchForm, model_path: e.target.value })
                }
                placeholder="/mnt/custom/path/to/model"
              />
            </label>
          ) : (
            <label>
              模型名称（YAML配置）
              <input
                value={launchForm.model_name}
                onChange={(e) =>
                  setLaunchForm({ ...launchForm, model_name: e.target.value })
                }
                placeholder="Qwen2.5-7B-Instruct"
              />
            </label>
          )}

          <label>
            引擎
            <select
              value={launchForm.engine}
              onChange={(e) =>
                setLaunchForm({ ...launchForm, engine: e.target.value })
              }
            >
              <option value="vllm">vLLM</option>
              <option value="sglang">SGLang</option>
              <option value="ftransformers">FTransformers</option>
            </select>
          </label>

          <label>
            TP (并行度)
            <input
              type="number"
              min="1"
              max="8"
              value={launchForm.tp}
              onChange={(e) =>
                setLaunchForm({ ...launchForm, tp: Number(e.target.value) })
              }
            />
          </label>

          <label>
            模式
            <select
              value={launchForm.mode}
              onChange={(e) =>
                setLaunchForm({ ...launchForm, mode: e.target.value })
              }
            >
              <option value="correct">Correct</option>
              <option value="perf">Perf</option>
            </select>
          </label>

          <label>
            端口
            <input
              type="number"
              min="1024"
              max="65535"
              value={launchForm.port}
              onChange={(e) =>
                setLaunchForm({ ...launchForm, port: Number(e.target.value) })
              }
            />
          </label>
        </div>

        <div className="actions">
          <button
            onClick={handleLaunchModel}
            disabled={launching || !sshConfig}
          >
            {launching ? "启动中..." : "启动模型"}
          </button>
          {!sshConfig && <span className="hint">请先配置 SSH 连接</span>}
        </div>
      </section>

      <section className="panel">
        <h2>模型实例 ({instances.length})</h2>

        {message && <div className="success">{message}</div>}
        {error && <div className="error">{error}</div>}

        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>状态</th>
              <th>模型</th>
              <th>引擎</th>
              <th>TP</th>
              <th>端口</th>
              <th>Endpoint</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {instances.map((inst) => (
              <tr key={inst.id}>
                <td>{inst.id}</td>
                <td>
                  {getStatusBadge(inst.status)} {inst.status}
                </td>
                <td>
                  <div>{inst.model_name}</div>
                  <small>{inst.model_family}</small>
                </td>
                <td>{inst.engine}</td>
                <td>{inst.tp}</td>
                <td>{inst.port}</td>
                <td>
                  <small>{inst.endpoint || "-"}</small>
                </td>
                <td className="actions-cell">
                  {inst.is_running && (
                    <button
                      className="link"
                      onClick={() => handleHealthCheck(inst.id)}
                    >
                      检查
                    </button>
                  )}
                  {!inst.is_stopped && (
                    <button
                      className="link danger"
                      onClick={() => handleStopModel(inst.id)}
                    >
                      停止
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!instances.length && (
              <tr>
                <td colSpan={8}>暂无模型实例</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
