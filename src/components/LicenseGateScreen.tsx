import React, { useEffect, useState } from "react";
import { commercialConfig } from "../config/commercial";

type LicenseStatusValue =
  | "inactive"
  | "valid"
  | "expired"
  | "revoked"
  | "activation_limit_hit"
  | "offline_grace"
  | "invalid_license"
  | "network_error";

interface LicenseGateScreenProps {
  onActivated: () => void;
}

const WECHAT_CONTACT = "13376072766";
const QQ_CONTACT = "1018825014";

export default function LicenseGateScreen({ onActivated }: LicenseGateScreenProps) {
  const [licenseKey, setLicenseKey] = useState("");
  const [hardwareId, setHardwareId] = useState("");
  const [status, setStatus] = useState<LicenseStatusValue>("inactive");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const showRenewContact =
    status === "expired" ||
    status === "revoked" ||
    /过期|续费|停用/i.test(error);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const [hwId, payload] = await Promise.all([
          window.electronAPI.licenseGetHardwareId(),
          window.electronAPI.licenseGetStatus(),
        ]);

        if (!mounted) {
          return;
        }

        setHardwareId(hwId);
        setStatus(payload.status);
        setExpiresAt(payload.license?.expiresAt || payload.entitlement?.expiresAt || null);
        setError(payload.error || "");

        if (payload.license?.licenseKey) {
          setLicenseKey(payload.license.licenseKey);
        }
      } catch (loadError) {
        console.error("[LicenseGateScreen] Failed to load status:", loadError);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  async function activate() {
    setIsBusy(true);
    setError("");

    try {
      const result = await window.electronAPI.licenseActivate(licenseKey);
      if (!result.success) {
        setStatus(result.status || "inactive");
        setExpiresAt(result.license?.expiresAt || result.entitlement?.expiresAt || null);
        setError(result.error || "激活失败，请检查授权码后重试。");
        return;
      }

      onActivated();
    } catch (activateError) {
      console.error("[LicenseGateScreen] Activation failed:", activateError);
      setError("激活失败，请稍后重试。");
    } finally {
      setIsBusy(false);
    }
  }

  function openLink(url: string) {
    window.electronAPI?.openExternal?.(url);
  }

  return (
    <div className="flex h-full w-full items-center justify-center overflow-auto bg-[radial-gradient(circle_at_top,_rgba(52,211,153,0.18),_transparent_36%),linear-gradient(180deg,_#07111f_0%,_#0d1728_100%)] px-6 py-10 text-slate-100">
      <div className="w-full max-w-[1080px] rounded-[32px] border border-white/10 bg-[#0b1423]/90 p-6 shadow-[0_32px_120px_rgba(0,0,0,0.45)] md:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
          <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
            <div className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200">
              License Required
            </div>
            <h1 className="mt-4 text-3xl font-semibold text-white">请输入授权码激活软件</h1>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              这是对外售卖版安装包。客户首次打开后，需要先输入你发给他的授权码，激活成功后才能继续进入主界面。
            </p>

            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-slate-400">
                  授权码
                </label>
                <input
                  value={licenseKey}
                  onChange={(event) => setLicenseKey(event.target.value)}
                  placeholder="NAT-XXXX-XXXX-XXXX-XXXX"
                  className="w-full rounded-2xl border border-white/10 bg-[#09111d] px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400/40"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-slate-400">
                  当前设备 ID
                </label>
                <div className="break-all rounded-2xl border border-white/10 bg-[#09111d] px-4 py-3 text-xs text-slate-300">
                  {hardwareId || "加载中..."}
                </div>
              </div>

              {error ? (
                <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm leading-6 text-rose-100">
                  {error}
                </div>
              ) : null}

              {showRenewContact ? (
                <div className="rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm leading-6 text-amber-50">
                  授权已失效或需要续费时，请把授权码和设备 ID 发给我，我会帮你续费、补发或处理换机问题。
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={activate}
                disabled={isBusy}
                className="rounded-2xl bg-gradient-to-r from-emerald-300 to-sky-300 px-5 py-3 text-sm font-semibold text-slate-900 transition hover:translate-y-[-1px] disabled:cursor-wait disabled:opacity-70"
              >
                {isBusy ? "激活中..." : "立即激活"}
              </button>
              <button
                onClick={() => openLink(commercialConfig.purchasePageUrl)}
                className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-medium text-white transition hover:border-white/20"
              >
                联系购买
              </button>
              <button
                onClick={() => openLink(commercialConfig.activationHelpUrl)}
                className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-medium text-white transition hover:border-white/20"
              >
                激活帮助
              </button>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400">当前状态</div>
              <div className="mt-3 text-2xl font-semibold text-white">{readableStatus(status, expiresAt)}</div>
              <div className="mt-3 text-sm leading-7 text-slate-300">
                {expiresAt
                  ? `到期时间：${formatDate(expiresAt)}`
                  : "时长版会从第一次激活成功后开始计时。"}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
              <div className="text-base font-semibold text-white">客户操作步骤</div>
              <div className="mt-3 space-y-3 text-sm leading-7 text-slate-300">
                <div>1. 安装软件后打开。</div>
                <div>2. 输入你发给他的授权码。</div>
                <div>3. 激活成功后，进入设置页填写自己的 PackyAPI 和阿里云 API Key。</div>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
              <div className="text-base font-semibold text-white">授权规则</div>
              <div className="mt-3 space-y-3 text-sm leading-7 text-slate-300">
                <div>常规授权码默认只允许 1 台设备激活。</div>
                <div>1 天 / 7 天 / 30 天 / 365 天版，均从第一次激活开始计时。</div>
                <div>推广试用码支持 1 到 7 天时长且不限设备，适合你前期分发和推广体验。</div>
              </div>
            </div>

            <div
              className={[
                "rounded-[28px] border p-6",
                showRenewContact
                  ? "border-amber-300/25 bg-amber-300/10"
                  : "border-white/10 bg-white/[0.03]",
              ].join(" ")}
            >
              <div className="text-base font-semibold text-white">
                {showRenewContact ? "授权已过期，请联系我续费" : "购买 / 续费联系"}
              </div>
              <div className="mt-3 space-y-3 text-sm leading-7 text-slate-200">
                <div>微信：{WECHAT_CONTACT}</div>
                <div>QQ：{QQ_CONTACT}</div>
                <div className="text-slate-300">
                  你可以把授权码和设备情况发给我，我会帮你续费、补发或处理换机问题。
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function readableStatus(status: LicenseStatusValue, expiresAt: string | null): string {
  switch (status) {
    case "valid":
      return expiresAt ? "已激活" : "已激活（永久版）";
    case "offline_grace":
      return "离线宽限期";
    case "expired":
      return "已过期";
    case "revoked":
      return "已停用";
    case "activation_limit_hit":
      return "设备数已满";
    case "invalid_license":
      return "授权码无效";
    case "network_error":
      return "网络异常";
    default:
      return "未激活";
  }
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}
