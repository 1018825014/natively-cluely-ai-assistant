import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ReleaseNoteSection {
    title: string;
    items: string[];
}

interface ParsedReleaseNotes {
    version: string;
    summary: string;
    sections: ReleaseNoteSection[];
    fullBody?: string;
    url?: string;
    downloadUrl?: string;
}

interface UpdateModalProps {
    isOpen: boolean;
    updateInfo: any;
    parsedNotes: ParsedReleaseNotes | null;
    onDismiss: () => void;
    onOpenDownloadPage: () => void;
}

const UpdateModal: React.FC<UpdateModalProps> = ({
    isOpen,
    updateInfo,
    parsedNotes,
    onDismiss,
    onOpenDownloadPage,
}) => {
    const displayVersion = updateInfo?.version?.startsWith?.('v')
        ? updateInfo.version
        : `v${updateInfo?.version || 'latest'}`;
    const sections = parsedNotes?.sections?.filter((section) => section.items.length > 0) || [];

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center font-sans antialiased">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={onDismiss}
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 10 }}
                        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                        className="relative w-[min(92vw,560px)] rounded-[28px] border border-white/[0.08] bg-[#141a22]/95 p-7 shadow-[0_32px_100px_rgba(0,0,0,0.5)]"
                    >
                        <div className="text-center">
                            <div className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200">
                                Update Feed
                            </div>
                            <h2 className="mt-4 text-[28px] font-semibold text-white">发现新版本</h2>
                            <p className="mt-2 text-sm text-white/60">
                                当前可下载版本 {displayVersion}。第一阶段会直接打开你的下载页，不走自动安装。
                            </p>
                        </div>

                        <div className="mt-6 max-h-[280px] overflow-y-auto rounded-3xl border border-white/8 bg-white/[0.03] p-5">
                            {parsedNotes?.summary && (
                                <p className="text-sm leading-7 text-white/80">{parsedNotes.summary}</p>
                            )}

                            {sections.length > 0 ? (
                                <div className="mt-4 space-y-5">
                                    {sections.map((section, index) => (
                                        <div key={`${section.title}-${index}`}>
                                            <h3 className="text-sm font-semibold text-white">{section.title}</h3>
                                            <ul className="mt-2 space-y-2 text-sm leading-6 text-white/65">
                                                {section.items.map((item, itemIndex) => (
                                                    <li key={`${section.title}-${itemIndex}`} className="flex gap-2">
                                                        <span className="mt-[7px] text-[10px] text-emerald-300">•</span>
                                                        <span>{item}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="mt-4 text-sm leading-7 text-white/60">
                                    新版本已经发布。点击下方按钮即可前往下载页获取最新安装包。
                                </p>
                            )}
                        </div>

                        <div className="mt-6 flex items-center justify-between gap-3">
                            <button
                                onClick={onDismiss}
                                className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-medium text-white/70 transition hover:border-white/20 hover:text-white"
                            >
                                稍后再说
                            </button>
                            <button
                                onClick={onOpenDownloadPage}
                                className="rounded-2xl bg-gradient-to-r from-emerald-300 to-sky-300 px-5 py-3 text-sm font-semibold text-slate-900 transition hover:translate-y-[-1px]"
                            >
                                打开下载页
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default UpdateModal;
