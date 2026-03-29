import React from 'react';
import {
    Shield,
    Globe,
    KeyRound,
    Download,
    Mail,
    FileText,
} from 'lucide-react';
import { commercialConfig } from '../config/commercial';

export const AboutSection: React.FC = () => {
    const open = (url: string) => {
        if (window.electronAPI?.openExternal) {
            window.electronAPI.openExternal(url);
        } else {
            window.open(url, '_blank');
        }
    };

    return (
        <div className="space-y-6 animated fadeIn pb-10">
            <div>
                <h3 className="text-lg font-bold text-text-primary mb-1">关于 {commercialConfig.appName}</h3>
                <p className="text-sm text-text-secondary">
                    中国区优先、本地优先的桌面 AI 会议与面试助手。
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                    onClick={() => open(commercialConfig.websiteUrl)}
                    className="text-left bg-bg-item-surface rounded-xl border border-border-subtle p-5 hover:bg-white/5 transition"
                >
                    <div className="flex items-center gap-3">
                        <Globe size={18} className="text-emerald-300" />
                        <h4 className="text-sm font-bold text-text-primary">官网</h4>
                    </div>
                    <p className="text-xs text-text-secondary mt-3 leading-6">
                        下载、购买、找回许可证与政策说明都统一从官网入口进入。
                    </p>
                </button>

                <button
                    onClick={() => open(commercialConfig.purchasePageUrl)}
                    className="text-left bg-bg-item-surface rounded-xl border border-border-subtle p-5 hover:bg-white/5 transition"
                >
                    <div className="flex items-center gap-3">
                        <KeyRound size={18} className="text-yellow-300" />
                        <h4 className="text-sm font-bold text-text-primary">购买授权</h4>
                    </div>
                    <p className="text-xs text-text-secondary mt-3 leading-6">
                        中国区首发采用时长许可证。购买完成后，你会通过许可证服务完成激活和后续续购。
                    </p>
                </button>

                <button
                    onClick={() => open(commercialConfig.downloadUrl)}
                    className="text-left bg-bg-item-surface rounded-xl border border-border-subtle p-5 hover:bg-white/5 transition"
                >
                    <div className="flex items-center gap-3">
                        <Download size={18} className="text-sky-300" />
                        <h4 className="text-sm font-bold text-text-primary">下载与更新</h4>
                    </div>
                    <p className="text-xs text-text-secondary mt-3 leading-6">
                        第一阶段通过下载页分发新版本。应用内检测到更新后会直接打开你的下载页。
                    </p>
                </button>

                <button
                    onClick={() => open(commercialConfig.activationHelpUrl)}
                    className="text-left bg-bg-item-surface rounded-xl border border-border-subtle p-5 hover:bg-white/5 transition"
                >
                    <div className="flex items-center gap-3">
                        <Mail size={18} className="text-pink-300" />
                        <h4 className="text-sm font-bold text-text-primary">找回许可证</h4>
                    </div>
                    <p className="text-xs text-text-secondary mt-3 leading-6">
                        如果你遗失了许可证，可以通过订单号和买家 ID 重新查询，也可以联系支持邮箱。
                    </p>
                </button>
            </div>

            <div className="bg-bg-item-surface rounded-xl border border-border-subtle p-5 space-y-4">
                <div className="flex items-start gap-3">
                    <Shield size={16} className="text-green-400 mt-0.5" />
                    <div>
                        <h5 className="text-sm font-medium text-text-primary">本地优先与激活校验</h5>
                        <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                            会议内容与本地索引默认保留在你的设备上。商业版新增的许可证服务只处理订单、设备指纹和激活状态。
                        </p>
                    </div>
                </div>
                <div className="flex items-start gap-3">
                    <FileText size={16} className="text-blue-400 mt-0.5" />
                    <div>
                        <h5 className="text-sm font-medium text-text-primary">商业化文档</h5>
                        <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                            下载页、隐私、退款与 EULA 已经独立于上游渠道。发售前请把主体信息、支持邮箱和最终条款替换成你的正式版本。
                        </p>
                    </div>
                </div>
            </div>

            <div className="pt-4 border-t border-border-subtle">
                <h4 className="text-xs font-bold text-text-tertiary uppercase tracking-wider mb-3">快速入口</h4>
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => open(commercialConfig.websiteUrl)}
                        className="px-3 py-2 rounded-lg bg-bg-input border border-border-subtle text-xs text-text-secondary hover:text-text-primary transition"
                    >
                        官网
                    </button>
                    <button
                        onClick={() => open(commercialConfig.purchasePageUrl)}
                        className="px-3 py-2 rounded-lg bg-bg-input border border-border-subtle text-xs text-text-secondary hover:text-text-primary transition"
                    >
                        购买
                    </button>
                    <button
                        onClick={() => open(commercialConfig.downloadUrl)}
                        className="px-3 py-2 rounded-lg bg-bg-input border border-border-subtle text-xs text-text-secondary hover:text-text-primary transition"
                    >
                        下载
                    </button>
                    <button
                        onClick={() => open(commercialConfig.privacyUrl)}
                        className="px-3 py-2 rounded-lg bg-bg-input border border-border-subtle text-xs text-text-secondary hover:text-text-primary transition"
                    >
                        隐私
                    </button>
                </div>
            </div>
        </div>
    );
};
