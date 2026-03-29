import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { commercialConfig } from '../../src/config/commercial';

type LicenseStatusValue =
  | 'inactive'
  | 'valid'
  | 'expired'
  | 'revoked'
  | 'activation_limit_hit'
  | 'offline_grace'
  | 'invalid_license'
  | 'network_error';

interface PremiumUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  isPremium: boolean;
  onActivated: () => void;
  onDeactivated: () => void;
}

export const PremiumUpgradeModal: React.FC<PremiumUpgradeModalProps> = ({
  isOpen,
  onClose,
  isPremium,
  onActivated,
  onDeactivated,
}) => {
  const [licenseKey, setLicenseKey] = useState('');
  const [hardwareId, setHardwareId] = useState('');
  const [status, setStatus] = useState<LicenseStatusValue>('inactive');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [statusText, setStatusText] = useState('未激活');
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    const load = async () => {
      try {
        const [hwId, payload] = await Promise.all([
          window.electronAPI.licenseGetHardwareId(),
          window.electronAPI.licenseGetStatus(),
        ]);
        if (!mounted) return;

        setHardwareId(hwId);
        setStatus(payload.status);
        setExpiresAt(payload.license?.expiresAt || payload.entitlement?.expiresAt || null);
        setStatusText(readableStatus(payload.status, payload.license?.expiresAt || payload.entitlement?.expiresAt || null));
        if (payload.license?.licenseKey) {
          setLicenseKey(payload.license.licenseKey);
        }
        setError(payload.error || '');
      } catch (loadError) {
        console.error('[PremiumUpgradeModal] Failed to load license status:', loadError);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [isOpen]);

  async function activate() {
    setIsBusy(true);
    setError('');
    try {
      const result = await window.electronAPI.licenseActivate(licenseKey);
      if (!result.success) {
        setError(result.error || '激活失败，请稍后重试。');
        return;
      }

      const payload = await window.electronAPI.licenseGetStatus();
      setStatus(payload.status);
      setExpiresAt(payload.license?.expiresAt || payload.entitlement?.expiresAt || null);
      setStatusText(readableStatus(payload.status, payload.license?.expiresAt || payload.entitlement?.expiresAt || null));
      onActivated();
    } catch (activateError) {
      console.error('[PremiumUpgradeModal] Activation failed:', activateError);
      setError('激活失败，请检查许可证或稍后重试。');
    } finally {
      setIsBusy(false);
    }
  }

  async function deactivate() {
    setIsBusy(true);
    setError('');
    try {
      await window.electronAPI.licenseDeactivate();
      setStatus('inactive');
      setExpiresAt(null);
      setStatusText('未激活');
      onDeactivated();
    } catch (deactivateError) {
      console.error('[PremiumUpgradeModal] Deactivation failed:', deactivateError);
      setError('停用失败，请稍后重试。');
    } finally {
      setIsBusy(false);
    }
  }

  function openLink(url: string) {
    window.electronAPI?.openExternal?.(url);
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ type: 'spring', stiffness: 280, damping: 28 }}
            className="relative z-10 w-[min(92vw,680px)] rounded-[28px] border border-white/10 bg-[#0f1828]/95 p-6 shadow-[0_32px_100px_rgba(0,0,0,0.45)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200">
                  China License
                </div>
                <h2 className="mt-4 text-[28px] font-semibold text-white">中国区授权中心</h2>
                <p className="mt-2 max-w-[520px] text-sm leading-6 text-slate-300">
                  中国区第一阶段采用“时长许可证 + 到期手动续购”。购买完成后，通过许可证即可在桌面应用中激活。
                </p>
              </div>
              <button
                onClick={onClose}
                className="rounded-full border border-white/10 px-3 py-1 text-sm text-slate-300 hover:border-white/20 hover:text-white"
              >
                关闭
              </button>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
              <section className="rounded-3xl border border-white/8 bg-white/[0.03] p-5">
                <h3 className="text-base font-semibold text-white">激活许可证</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  支持 1 天、7 天、30 天、365 天和永久版。你可以先购买，再回来输入许可证。
                </p>

                <div className="mt-4 space-y-3">
                  <div>
                    <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-slate-400">
                      许可证
                    </label>
                    <input
                      value={licenseKey}
                      onChange={(event) => setLicenseKey(event.target.value)}
                      placeholder="NAT-XXXX-XXXX-XXXX-XXXX"
                      className="w-full rounded-2xl border border-white/10 bg-[#0c1422] px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400/40"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-slate-400">
                      当前设备 ID
                    </label>
                    <div className="rounded-2xl border border-white/10 bg-[#0c1422] px-4 py-3 text-xs text-slate-300">
                      {hardwareId || '加载中...'}
                    </div>
                  </div>

                  {error && (
                    <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                      {error}
                    </div>
                  )}
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    onClick={activate}
                    disabled={isBusy}
                    className="rounded-2xl bg-gradient-to-r from-emerald-300 to-sky-300 px-4 py-3 text-sm font-semibold text-slate-900 transition hover:translate-y-[-1px] disabled:cursor-wait disabled:opacity-70"
                  >
                    {isBusy ? '处理中...' : '激活授权'}
                  </button>
                  <button
                    onClick={() => openLink(commercialConfig.purchasePageUrl)}
                    className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-medium text-white transition hover:border-white/20"
                  >
                    打开购买页
                  </button>
                  <button
                    onClick={() => openLink(commercialConfig.activationHelpUrl)}
                    className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-medium text-white transition hover:border-white/20"
                  >
                    找回许可证
                  </button>
                </div>
              </section>

              <aside className="rounded-3xl border border-white/8 bg-white/[0.03] p-5">
                <h3 className="text-base font-semibold text-white">授权状态</h3>
                <div className="mt-4 rounded-2xl border border-white/10 bg-[#0c1422] p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-400">当前状态</div>
                  <div className="mt-2 text-2xl font-semibold text-white">{statusText}</div>
                  <div className="mt-2 text-sm text-slate-300">
                    {expiresAt ? `到期时间：${formatDate(expiresAt)}` : status === 'valid' || isPremium ? '当前许可证无需到期续费。' : '输入许可证后可查看到期时间。'}
                  </div>
                </div>

                <div className="mt-4 space-y-3 text-sm text-slate-300">
                  <div className="rounded-2xl border border-white/10 bg-[#0c1422] p-4">
                    <div className="font-medium text-white">首发规则</div>
                    <ul className="mt-2 list-disc space-y-1 pl-5 leading-6">
                      <li>每个订单默认发 1 个许可证</li>
                      <li>每个许可证默认仅允许 1 台设备激活</li>
                      <li>时长版到期后手动续购</li>
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-[#0c1422] p-4">
                    <div className="font-medium text-white">售后建议</div>
                    <p className="mt-2 leading-6">
                      如果你换机了，请先在旧设备停用。若旧设备已经不可访问，请通过找回页或支持邮箱处理。
                    </p>
                  </div>
                </div>

                {(status === 'valid' || status === 'offline_grace') && (
                  <button
                    onClick={deactivate}
                    disabled={isBusy}
                    className="mt-5 w-full rounded-2xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm font-medium text-rose-100 transition hover:bg-rose-300/15 disabled:cursor-wait disabled:opacity-70"
                  >
                    停用当前设备
                  </button>
                )}
              </aside>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

function readableStatus(status: LicenseStatusValue, expiresAt: string | null): string {
  switch (status) {
    case 'valid':
      return expiresAt ? '已激活' : '已激活（永久版）';
    case 'offline_grace':
      return '离线宽限中';
    case 'expired':
      return '已过期';
    case 'revoked':
      return '已停用';
    case 'activation_limit_hit':
      return '设备上限已满';
    case 'network_error':
      return '网络异常';
    default:
      return '未激活';
  }
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}
