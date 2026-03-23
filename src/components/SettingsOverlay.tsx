import React, { useState, useEffect } from 'react';
import packageJson from '../../package.json';
import {
    X, Mic, Speaker, Monitor, Keyboard, User, LifeBuoy, LogOut, Upload,
    ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
    Camera, RotateCcw, Eye, Layout, MessageSquare, Crop,
    ChevronDown, ChevronUp, Check, BadgeCheck, Power, Palette, Calendar, Ghost, Sun, Moon, RefreshCw, Info, Globe, FlaskConical, Terminal, Settings, Activity, ExternalLink, Trash2,
    Sparkles, Pencil, Briefcase, Building2, Search, MapPin, CheckCircle, HelpCircle, Zap, SlidersHorizontal
} from 'lucide-react';
import { analytics } from '../lib/analytics/analytics.service';
import { AboutSection } from './AboutSection';
import { AIProvidersSettings } from './settings/AIProvidersSettings';
import { motion, AnimatePresence } from 'framer-motion';
import { useShortcuts } from '../hooks/useShortcuts';
import { KeyRecorder } from './ui/KeyRecorder';
import { ProfileVisualizer, PremiumUpgradeModal } from '../premium';
import icon from './icon.png';

// ---------------------------------------------------------------------------
// MockupNativelyInterface — fake in-meeting widget for the opacity preview
// ---------------------------------------------------------------------------
const MockupNativelyInterface = ({ opacity }: { opacity: number }) => (
    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none bg-transparent">
        {/* NativelyInterface Widget — opacity controlled by the slider */}
        <div
            id="mockup-natively-interface"
            style={{ opacity, transition: 'opacity 75ms ease' }}
            className="flex flex-col items-center pointer-events-none -mt-56"
        >
            {/* TopPill Replica */}
            <div className="flex justify-center mb-2 select-none z-50">
                <div className="flex items-center gap-2 rounded-full bg-[#1E1E1E]/80 backdrop-blur-md border border-white/10 shadow-lg shadow-black/20 pl-1.5 pr-1.5 py-1.5">
                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center overflow-hidden">
                        <img
                            src={icon}
                            alt="Natively"
                            className="w-[24px] h-[24px] object-contain opacity-90 scale-105"
                            draggable="false"
                        />
                    </div>
                    <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 text-[12px] font-medium text-slate-200 border border-white/0">
                        <ChevronUp className="w-3.5 h-3.5 opacity-70" />
                        <span className="opacity-80 tracking-wide">隐藏</span>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white">
                        <div className="w-3.5 h-3.5 rounded-[3px] bg-red-400 opacity-80" />
                    </div>
                </div>
            </div>

            {/* Main Interface Window Replica */}
            <div className="relative w-[600px] max-w-full bg-[#1E1E1E]/95 backdrop-blur-2xl border border-white/10 shadow-2xl shadow-black/40 rounded-[24px] overflow-hidden flex flex-col pt-2 pb-3">
                
                {/* Chat History Mock */}
                <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
                    <div className="flex justify-start">
                        <div className="max-w-[85%] px-4 py-3 text-[14px] leading-relaxed text-slate-200 font-normal">
                            <span className="font-semibold text-emerald-400 block mb-1">建议</span>
                            比较稳妥的做法是用哈希表缓存中间结果，这样时间复杂度可以从 O(n²) 降到 O(n)。
                        </div>
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="flex flex-nowrap justify-center items-center gap-1.5 px-4 pb-3 pt-3">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium text-slate-400 bg-white/5 border border-white/0 shrink-0">
                        <Pencil className="w-3 h-3 opacity-70" /> 怎么回答？
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium text-slate-400 bg-white/5 border border-white/0 shrink-0">
                        <MessageSquare className="w-3 h-3 opacity-70" /> 精简
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium text-slate-400 bg-white/5 border border-white/0 shrink-0">
                        <RefreshCw className="w-3 h-3 opacity-70" /> 总结
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium text-slate-400 bg-white/5 border border-white/0 shrink-0">
                        <HelpCircle className="w-3 h-3 opacity-70" /> 追问问题
                    </div>
                    <div className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium bg-white/5 text-slate-400 min-w-[74px] shrink-0">
                        <Zap className="w-3 h-3 opacity-70" /> 回答
                    </div>
                </div>

                {/* Input Area */}
                <div className="px-3">
                    <div className="relative group">
                        <div className="w-full bg-[#1E1E1E] border border-white/5 rounded-xl pl-3 pr-10 py-2.5 h-[38px] flex items-center">
                            <span className="text-[13px] text-slate-500">屏幕内容或当前对话都可以问</span>
                        </div>
                    </div>

                    {/* Bottom Row */}
                    <div className="flex items-center justify-between mt-3 px-0.5">
                        <div className="flex items-center gap-1.5">
                            <div className="flex items-center gap-2 px-3 py-1.5 border border-white/10 rounded-lg text-xs font-medium w-[140px] bg-black/20 text-white/70">
                                <span className="truncate min-w-0 flex-1">Gemini 3 Flash</span>
                                <ChevronDown size={14} className="shrink-0" />
                            </div>
                            <div className="w-px h-3 bg-white/10 mx-1" />
                            <div className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 bg-white/5">
                                <SlidersHorizontal className="w-3.5 h-3.5" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
);

interface CustomSelectProps {
    label: string;
    icon: React.ReactNode;
    value: string;
    options: MediaDeviceInfo[];
    onChange: (value: string) => void;
    placeholder?: string;
}

const CustomSelect: React.FC<CustomSelectProps> = ({ label, icon, value, options, onChange, placeholder = "选择设备" }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedLabel = options.find(o => o.deviceId === value)?.label || placeholder;

    return (
        <div className="bg-bg-card rounded-xl p-4 border border-border-subtle" ref={containerRef}>
            {label && (
                <div className="flex items-center gap-2 mb-3">
                    <span className="text-text-secondary">{icon}</span>
                    <label className="text-xs font-medium text-text-primary uppercase tracking-wide">{label}</label>
                </div>
            )}

            <div className="relative">
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="w-full bg-bg-input border border-border-subtle rounded-lg px-3 py-2.5 text-sm text-text-primary flex items-center justify-between hover:bg-bg-elevated transition-colors"
                >
                    <span className="truncate pr-4">{selectedLabel}</span>
                    <ChevronDown size={14} className={`text-text-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOpen && (
                    <div className="absolute top-full left-0 w-full mt-1 bg-bg-elevated border border-border-subtle rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto animated fadeIn">
                        <div className="p-1 space-y-0.5">
                            {options.map((device) => (
                                <button
                                    key={device.deviceId}
                                    onClick={() => {
                                        onChange(device.deviceId);
                                        setIsOpen(false);
                                    }}
                                    className={`w-full text-left px-3 py-2 text-sm rounded-md flex items-center justify-between group transition-colors ${value === device.deviceId ? 'bg-bg-input hover:bg-bg-elevated text-text-primary' : 'text-text-secondary hover:bg-bg-input hover:text-text-primary'}`}
                                >
                                    <span className="truncate">{device.label || `Device ${device.deviceId.slice(0, 5)}...`}</span>
                                    {value === device.deviceId && <Check size={14} className="text-accent-primary" />}
                                </button>
                            ))}
                            {options.length === 0 && (
                                <div className="px-3 py-2 text-sm text-gray-500 italic">未找到设备</div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

interface ProviderOption {
    id: string;
    label: string;
    badge?: string | null;
    recommended?: boolean;
    desc: string;
    color: string;
    icon: React.ReactNode;
}

interface ProviderSelectProps {
    value: string;
    options: ProviderOption[];
    onChange: (value: string) => void;
}

const ProviderSelect: React.FC<ProviderSelectProps> = ({ value, options, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selected = options.find(o => o.id === value);

    const getBadgeStyle = (color?: string) => {
        switch (color) {
            case 'blue': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
            case 'orange': return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
            case 'purple': return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
            case 'teal': return 'bg-teal-500/10 text-teal-500 border-teal-500/20';
            case 'cyan': return 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20';
            case 'indigo': return 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20';
            case 'green': return 'bg-green-500/10 text-green-500 border-green-500/20';
            default: return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
        }
    };

    const getIconStyle = (color?: string, isSelectedItem: boolean = false) => {
        if (isSelectedItem) return 'bg-accent-primary text-white shadow-sm';
        // For unselected items in list or trigger
        switch (color) {
            case 'blue': return 'bg-blue-500/10 text-blue-600';
            case 'orange': return 'bg-orange-500/10 text-orange-600';
            case 'purple': return 'bg-purple-500/10 text-purple-600';
            case 'teal': return 'bg-teal-500/10 text-teal-600';
            case 'cyan': return 'bg-cyan-500/10 text-cyan-600';
            case 'indigo': return 'bg-indigo-500/10 text-indigo-600';
            case 'green': return 'bg-green-500/10 text-green-600';
            default: return 'bg-gray-500/10 text-gray-600';
        }
    };

    return (
        <div ref={containerRef} className="relative z-20 font-sans">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full group bg-bg-input border border-border-subtle hover:border-border-muted shadow-sm rounded-xl p-2.5 pr-3.5 flex items-center justify-between transition-all duration-200 outline-none focus:ring-2 focus:ring-accent-primary/20 ${isOpen ? 'ring-2 ring-accent-primary/20 border-accent-primary/50' : 'hover:shadow-md'}`}
            >
                {selected ? (
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 transition-all duration-300 ${getIconStyle(selected.color)}`}>
                            {selected.icon}
                        </div>
                        <div className="min-w-0 flex-1 text-left">
                            <div className="flex items-center gap-2">
                                <span className="text-[13px] font-semibold text-text-primary truncate leading-tight">{selected.label}</span>
                                {selected.badge && <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide ml-2 ${getBadgeStyle(selected.badge === '已保存' ? 'green' : selected.color)}`}>{selected.badge}</span>}
                                {selected.recommended && <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide ml-2 ${getBadgeStyle(selected.color)}`}>推荐</span>}
                            </div>
                            {/* Short description for trigger */}
                            <span className="text-[11px] text-text-tertiary truncate block leading-tight mt-0.5">{selected.desc}</span>
                        </div>
                    </div>
                ) : <span className="text-text-secondary px-2 text-sm">选择提供商</span>}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-text-tertiary transition-transform duration-300 group-hover:bg-bg-surface ${isOpen ? 'rotate-180 bg-bg-surface text-text-primary' : ''}`}>
                    <ChevronDown size={14} strokeWidth={2.5} />
                </div>
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 4, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.98 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="absolute top-full left-0 w-full mt-2 bg-bg-elevated/90 backdrop-blur-xl border border-white/5 rounded-xl shadow-2xl overflow-hidden ring-1 ring-black/5"
                    >
                        <div className="max-h-[320px] overflow-y-auto p-1.5 space-y-0.5 custom-scrollbar">
                            {options.map(option => {
                                const isSelected = value === option.id;
                                return (
                                    <button
                                        key={option.id}
                                        onClick={() => { onChange(option.id); setIsOpen(false); }}
                                        className={`w-full rounded-[10px] p-2 flex items-center gap-3 transition-all duration-200 group relative ${isSelected ? 'bg-white/10 shadow-inner' : 'hover:bg-white/5'}`}
                                    >
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-200 ${isSelected ? 'scale-100' : 'scale-95 group-hover:scale-100'} ${getIconStyle(option.color, false)}`}>
                                            {option.icon}
                                        </div>
                                        <div className="flex-1 min-w-0 text-left">
                                            <div className="flex items-center justify-between mb-0.5">
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-[13px] font-medium transition-colors ${isSelected ? 'text-white' : 'text-text-primary'}`}>{option.label}</span>
                                                    {option.badge && <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide ${getBadgeStyle(option.badge === '已保存' ? 'green' : option.color)}`}>{option.badge}</span>}
                                                    {option.recommended && <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide ${getBadgeStyle(option.color)}`}>推荐</span>}
                                                </div>
                                                {isSelected && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}><Check size={14} className="text-accent-primary" strokeWidth={3} /></motion.div>}
                                            </div>
                                            <span className={`text-[11px] block truncate transition-colors ${isSelected ? 'text-white/70' : 'text-text-tertiary'}`}>{option.desc}</span>
                                        </div>
                                        {/* Hover Indicator */}
                                        {!isSelected && <div className="absolute inset-0 rounded-[10px] ring-1 ring-inset ring-white/0 group-hover:ring-white/5 pointer-events-none" />}
                                    </button>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

interface SettingsOverlayProps {
    isOpen: boolean;
    onClose: () => void;
    initialTab?: string;
}

const SettingsOverlay: React.FC<SettingsOverlayProps> = ({ isOpen, onClose, initialTab = 'general' }) => {
    const [activeTab, setActiveTab] = useState(initialTab);
    
    // Sync active tab when modal opens
    useEffect(() => {
        if (isOpen && initialTab) {
            setActiveTab(initialTab);
            
            // Proactively load profile data if starting on profile tab
            if (initialTab === 'profile') {
                window.electronAPI?.profileGetStatus?.().then(setProfileStatus).catch(() => { });
                window.electronAPI?.profileGetProfile?.().then(setProfileData).catch(() => { });
            }
        }
    }, [isOpen, initialTab]);
    
    const { shortcuts, updateShortcut, resetShortcuts } = useShortcuts();
    const [isUndetectable, setIsUndetectable] = useState(false);
    const [disguiseMode, setDisguiseMode] = useState<'terminal' | 'settings' | 'activity' | 'none'>('none');
    const [openOnLogin, setOpenOnLogin] = useState(false);
    const [themeMode, setThemeMode] = useState<'system' | 'light' | 'dark'>('system');
    const [isThemeDropdownOpen, setIsThemeDropdownOpen] = useState(false);
    const [isAiLangDropdownOpen, setIsAiLangDropdownOpen] = useState(false);
    const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'uptodate' | 'error'>('idle');
    const themeDropdownRef = React.useRef<HTMLDivElement>(null);
    const aiLangDropdownRef = React.useRef<HTMLDivElement>(null);

    // Profile Engine State
    const [profileStatus, setProfileStatus] = useState<{
        hasProfile: boolean;
        profileMode: boolean;
        name?: string;
        role?: string;
        totalExperienceYears?: number;
    }>({ hasProfile: false, profileMode: false });
    const [profileUploading, setProfileUploading] = useState(false);
    const [profileError, setProfileError] = useState('');
    const [profileData, setProfileData] = useState<any>(null);
    const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);
    const [isPremium, setIsPremium] = useState(false);
    const [jdUploading, setJdUploading] = useState(false);
    const [jdError, setJdError] = useState('');
    const [companyResearching, setCompanyResearching] = useState(false);
    const [companyDossier, setCompanyDossier] = useState<any>(null);
    const [googleSearchApiKey, setGoogleSearchApiKey] = useState('');
    const [googleSearchCseId, setGoogleSearchCseId] = useState('');
    const [hasStoredGoogleSearchKey, setHasStoredGoogleSearchKey] = useState(false);
    const [hasStoredGoogleSearchCseId, setHasStoredGoogleSearchCseId] = useState(false);
    const [googleSearchSaving, setGoogleSearchSaving] = useState(false);

    // Close dropdown when clicking outside
    // Sync with global state changes
    useEffect(() => {
        if (isOpen) {
            window.electronAPI?.licenseCheckPremium?.().then(setIsPremium).catch(() => { });
            
            // Fetch true initial state from main process
            window.electronAPI?.getUndetectable?.().then(setIsUndetectable).catch(() => { });
            window.electronAPI?.getDisguise?.().then(setDisguiseMode).catch(() => { });
        }
    }, [isOpen]);

    useEffect(() => {
        if (window.electronAPI?.onUndetectableChanged) {
            const unsubscribe = window.electronAPI.onUndetectableChanged((newState: boolean) => {
                setIsUndetectable(newState);
            });
            return () => unsubscribe();
        }
    }, []);

    useEffect(() => {
        if (window.electronAPI?.onDisguiseChanged) {
            const unsubscribe = window.electronAPI.onDisguiseChanged((newMode: any) => {
                setDisguiseMode(newMode);
            });
            return () => unsubscribe();
        }
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (themeDropdownRef.current && !themeDropdownRef.current.contains(event.target as Node)) {
                setIsThemeDropdownOpen(false);
            }
            if (aiLangDropdownRef.current && !aiLangDropdownRef.current.contains(event.target as Node)) {
                setIsAiLangDropdownOpen(false);
            }
        };

        if (isThemeDropdownOpen || isAiLangDropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isThemeDropdownOpen, isAiLangDropdownOpen]);

    // Recognition Language
    const [recognitionLanguage, setRecognitionLanguage] = useState('');
    const [selectedSttGroup, setSelectedSttGroup] = useState('');
    const [availableLanguages, setAvailableLanguages] = useState<Record<string, any>>({});
    const [languageOptions, setLanguageOptions] = useState<any[]>([]);

    // AI Response Language
    const [aiResponseLanguage, setAiResponseLanguage] = useState('English');
    const [availableAiLanguages, setAvailableAiLanguages] = useState<any[]>([]);

    // Overlay Opacity state
    const [overlayOpacity, setOverlayOpacity] = useState<number>(() => {
        const stored = localStorage.getItem('natively_overlay_opacity');
        if (!stored) return 0.65;
        const parsed = parseFloat(stored);
        return !isNaN(parsed) && parsed >= 0.15 && parsed <= 1.0 ? parsed : 0.65;
    });

    // Live preview state — true while the user is holding down the slider
    const [isPreviewingOpacity, setIsPreviewingOpacity] = useState(false);

    // Ref to hold the latest opacity value without triggering renders during drag
    const latestOpacityRef = React.useRef(overlayOpacity);

    const handleOpacityChange = (val: number) => {
        // DOM-direct updates for 0-lag 60fps drag (bypasses React reconciliation)
        const percentText = `${Math.round(val * 100)}%`;
        document.querySelectorAll('.opacity-percent-label').forEach(el => el.textContent = percentText);
        const mockWrapper = document.getElementById('mockup-natively-interface');
        if (mockWrapper) mockWrapper.style.opacity = String(val);
        latestOpacityRef.current = val;
        
        // Broadcast IPC in real-time so actual meeting overlay tracks slider instantly
        // (safe to do at 60fps, does not trigger React renders)
        window.electronAPI?.setOverlayOpacity?.(val);
    };

    // Bug fix #3: keep latestOpacityRef in sync when overlayOpacity changes outside of a drag
    // (e.g. on first mount, or if another part of code updates it)
    useEffect(() => {
        latestOpacityRef.current = overlayOpacity;
    }, [overlayOpacity]);

    // Bug fix #3 (close-during-drag): if the overlay closes while the user is still dragging,
    // restore all DOM state so nothing is left in a broken state.
    useEffect(() => {
        if (!isOpen && isPreviewingOpacity) {
            stopPreviewingOpacity();
        }
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    const startPreviewingOpacity = () => {
        // Bug fix #5: guard against rapid repeated calls (double pointerDown / touch events)
        if (isPreviewingOpacity) return;

        // Direct DOM mutation for sub-millisecond instant hide (bypassing slow React tree diffs)
        document.body.classList.add('disable-transitions');
        
        const backdrop = document.getElementById('settings-backdrop');
        const wrapper = document.getElementById('settings-panel-wrapper');
        const panel = document.getElementById('settings-panel');
        const card = document.getElementById('opacity-slider-card');
        const mockup = document.getElementById('settings-mockup-wrapper');
        const launcher = document.getElementById('launcher-container');

        if (backdrop) {
            backdrop.style.backgroundColor = 'transparent';
            backdrop.style.backdropFilter = 'none';
            backdrop.style.transition = 'none';
        }
        if (wrapper) {
            wrapper.style.backgroundColor = 'transparent';
            wrapper.style.border = 'none';
            wrapper.style.boxShadow = 'none';
        }
        if (panel) {
            panel.style.visibility = 'hidden';
        }
        if (launcher) {
            launcher.style.visibility = 'hidden';
        }
        
        if (card) {
            card.style.visibility = 'visible';
            card.style.position = 'relative';
            card.style.zIndex = '9999';
        }
        if (mockup) {
            mockup.style.opacity = '1';
        }

        setIsPreviewingOpacity(true);
    };

    const stopPreviewingOpacity = () => {
        // Direct DOM restoration
        document.body.classList.remove('disable-transitions');
        const backdrop = document.getElementById('settings-backdrop');
        const wrapper = document.getElementById('settings-panel-wrapper');
        const panel = document.getElementById('settings-panel');
        const card = document.getElementById('opacity-slider-card');
        const mockup = document.getElementById('settings-mockup-wrapper');
        const launcher = document.getElementById('launcher-container');

        if (backdrop) {
            backdrop.style.backgroundColor = '';
            backdrop.style.backdropFilter = '';
            backdrop.style.transition = '';
        }
        if (wrapper) {
            wrapper.style.backgroundColor = '';
            wrapper.style.border = '';
            wrapper.style.boxShadow = '';
        }
        if (panel) {
            panel.style.visibility = '';
        }
        if (launcher) {
            launcher.style.visibility = '';
        }

        if (card) {
            card.style.visibility = '';
            card.style.position = '';
            card.style.zIndex = '';
        }
        if (mockup) {
            // Bug fix #4: restore mockup to hidden (opacity 0) rather than leaving it visible
            mockup.style.opacity = '0';
        }

        setIsPreviewingOpacity(false);
        // Sync final dragged value back to React state (persists to localStorage + IPC via useEffect)
        setOverlayOpacity(latestOpacityRef.current);
    };

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            localStorage.setItem('natively_overlay_opacity', String(overlayOpacity));
            window.electronAPI?.setOverlayOpacity?.(overlayOpacity);
        }, 150);
        return () => clearTimeout(timeoutId);
    }, [overlayOpacity]);

    useEffect(() => {
        const loadLanguages = async () => {
            if (window.electronAPI?.getRecognitionLanguages) {
                const langs = await window.electronAPI.getRecognitionLanguages();
                setAvailableLanguages(langs);

                // Load stored preference or auto-detect
                const storedStt = await window.electronAPI.getSttLanguage();
                let currentLangKey = storedStt;

                if (!currentLangKey) {
                    const systemLocale = navigator.language;
                    // Try to find exact match or primary match
                    const match = Object.entries(langs).find(([_, config]: [string, any]) =>
                        config.bcp47 === systemLocale ||
                        config.iso639 === systemLocale ||
                        (config.alternates && config.alternates.includes(systemLocale))
                    );

                    currentLangKey = match ? match[0] : 'english-us';

                    // Save the auto-detected default
                    if (window.electronAPI?.setRecognitionLanguage) {
                        window.electronAPI.setRecognitionLanguage(currentLangKey);
                    }
                }

                setRecognitionLanguage(currentLangKey);

                // Initialize Group based on current language
                if (langs[currentLangKey]) {
                    setSelectedSttGroup(langs[currentLangKey].group);
                } else {
                    setSelectedSttGroup('English');
                }
            }

            if (window.electronAPI?.getAiResponseLanguages) {
                const aiLangs = await window.electronAPI.getAiResponseLanguages();
                // Sort: English first, then alphabetical
                const sortedAiLangs = [...aiLangs].sort((a, b) => {
                    if (a.label === 'English') return -1;
                    if (b.label === 'English') return 1;
                    return a.label.localeCompare(b.label);
                });
                setAvailableAiLanguages(sortedAiLangs);

                const storedAi = await window.electronAPI.getAiResponseLanguage();
                setAiResponseLanguage(storedAi || 'English');
            }
        };
        loadLanguages();
    }, []);

    const handleLanguageChange = async (key: string) => {
        setRecognitionLanguage(key);
        if (availableLanguages[key]) {
            setSelectedSttGroup(availableLanguages[key].group);
        }
        if (window.electronAPI?.setRecognitionLanguage) {
            await window.electronAPI.setRecognitionLanguage(key);
        }
    };

    const handleGroupChange = (group: string) => {
        setSelectedSttGroup(group);
        // Find default variant for this group (first one)
        const firstVariant = Object.entries(availableLanguages).find(([_, lang]) => lang.group === group);
        if (firstVariant) {
            handleLanguageChange(firstVariant[0]);
        }
    };

    // Helper to get unique groups
    const languageGroups = Array.from(new Set(Object.values(availableLanguages).map((l: any) => l.group)))
        .sort((a, b) => {
            if (a === 'English') return -1;
            if (b === 'English') return 1;
            return a.localeCompare(b);
        });

    // Helper to get variants for current group
    const currentGroupVariants = Object.entries(availableLanguages)

        .filter(([_, lang]) => lang.group === selectedSttGroup)
        .map(([key, lang]) => ({
            deviceId: key,
            label: lang.label,
            kind: 'audioinput' as MediaDeviceKind,
            groupId: '',
            toJSON: () => ({})
        }));

    const handleAiLanguageChange = async (key: string) => {
        setAiResponseLanguage(key);
        if (window.electronAPI?.setAiResponseLanguage) {
            await window.electronAPI.setAiResponseLanguage(key);
        }
    };


    // Theme Handlers
    const handleSetTheme = async (mode: 'system' | 'light' | 'dark') => {
        setThemeMode(mode);
        if (window.electronAPI?.setThemeMode) {
            await window.electronAPI.setThemeMode(mode);
        }
    };

    // Audio Settings
    const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
    const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedInput, setSelectedInput] = useState('');
    const [selectedOutput, setSelectedOutput] = useState('');
    const [micLevel, setMicLevel] = useState(0);
    const [useExperimentalSck, setUseExperimentalSck] = useState(false);

    // STT Provider settings
    const [sttProvider, setSttProvider] = useState<'google' | 'groq' | 'openai' | 'deepgram' | 'elevenlabs' | 'azure' | 'ibmwatson' | 'soniox' | 'alibaba'>('alibaba');
    const [groqSttModel, setGroqSttModel] = useState('whisper-large-v3-turbo');
    const [sttGroqKey, setSttGroqKey] = useState('');
    const [sttOpenaiKey, setSttOpenaiKey] = useState('');
    const [sttDeepgramKey, setSttDeepgramKey] = useState('');
    const [sttElevenLabsKey, setSttElevenLabsKey] = useState('');
    const [sttAzureKey, setSttAzureKey] = useState('');
    const [sttAzureRegion, setSttAzureRegion] = useState('eastus');
    const [sttIbmKey, setSttIbmKey] = useState('');
    const [sttAlibabaKey, setSttAlibabaKey] = useState('');
    const [sttTestStatus, setSttTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
    const [sttTestError, setSttTestError] = useState('');
    const [sttSaving, setSttSaving] = useState(false);
    const [sttSaved, setSttSaved] = useState(false);
    const [googleServiceAccountPath, setGoogleServiceAccountPath] = useState<string | null>(null);
    const [hasStoredSttGroqKey, setHasStoredSttGroqKey] = useState(false);
    const [hasStoredSttOpenaiKey, setHasStoredSttOpenaiKey] = useState(false);
    const [hasStoredDeepgramKey, setHasStoredDeepgramKey] = useState(false);
    const [hasStoredElevenLabsKey, setHasStoredElevenLabsKey] = useState(false);
    const [hasStoredAzureKey, setHasStoredAzureKey] = useState(false);
    const [hasStoredIbmWatsonKey, setHasStoredIbmWatsonKey] = useState(false);
    const [sttSonioxKey, setSttSonioxKey] = useState('');
    const [hasStoredSonioxKey, setHasStoredSonioxKey] = useState(false);
    const [hasStoredAlibabaKey, setHasStoredAlibabaKey] = useState(false);
    const [technicalGlossaryText, setTechnicalGlossaryText] = useState('');
    const [alibabaWorkspaceId, setAlibabaWorkspaceId] = useState('');
    const [alibabaVocabularyId, setAlibabaVocabularyId] = useState('');
    const [glossarySaving, setGlossarySaving] = useState(false);
    const [glossarySaved, setGlossarySaved] = useState(false);
    const [glossarySaveMessage, setGlossarySaveMessage] = useState('');
    const [sttCompareResults, setSttCompareResults] = useState<any>(null);
    const [sttCompareBusy, setSttCompareBusy] = useState<'idle' | 'starting' | 'stopping' | 'exporting'>('idle');
    const [sttCompareExportMessage, setSttCompareExportMessage] = useState('');
    const [isSttDropdownOpen, setIsSttDropdownOpen] = useState(false);
    const sttDropdownRef = React.useRef<HTMLDivElement>(null);

    // Close STT dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (sttDropdownRef.current && !sttDropdownRef.current.contains(event.target as Node)) {
                setIsSttDropdownOpen(false);
            }
        };
        if (isSttDropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isSttDropdownOpen]);

    // Load STT settings on mount
    useEffect(() => {
        const loadSttSettings = async () => {
            try {
                // @ts-ignore
                const creds = await window.electronAPI?.getStoredCredentials?.();
                if (creds) {
                    setSttProvider(creds.sttProvider || 'alibaba');
                    if (creds.groqSttModel) setGroqSttModel(creds.groqSttModel);
                    setGoogleServiceAccountPath(creds.googleServiceAccountPath);
                    setHasStoredSttGroqKey(creds.hasSttGroqKey);
                    setHasStoredSttOpenaiKey(creds.hasSttOpenaiKey);
                    setHasStoredDeepgramKey(creds.hasDeepgramKey);
                    setHasStoredElevenLabsKey(creds.hasElevenLabsKey);
                    setHasStoredAzureKey(creds.hasAzureKey);
                    if (creds.azureRegion) setSttAzureRegion(creds.azureRegion);
                    setHasStoredIbmWatsonKey(creds.hasIbmWatsonKey);
                    setHasStoredSonioxKey(creds.hasSonioxKey || false);
                    setHasStoredAlibabaKey(creds.hasAlibabaKey || false);
                    if (creds.technicalGlossaryConfig) {
                        const entries = Array.isArray(creds.technicalGlossaryConfig.entries)
                            ? creds.technicalGlossaryConfig.entries
                            : [];
                        setTechnicalGlossaryText(entries.map((entry: any) =>
                            typeof entry?.weight === 'number' ? `${entry.term} | ${entry.weight}` : entry.term
                        ).join('\n'));
                        setAlibabaWorkspaceId(creds.technicalGlossaryConfig.alibabaWorkspaceId || '');
                        setAlibabaVocabularyId(creds.technicalGlossaryConfig.alibabaVocabularyId || '');
                    }
                    setHasStoredGoogleSearchKey(creds.hasGoogleSearchKey || false);
                    setHasStoredGoogleSearchCseId(creds.hasGoogleSearchCseId || false);
                }

                const compareResults = await window.electronAPI?.getSttCompareResults?.();
                if (compareResults) {
                    setSttCompareResults(compareResults);
                }
            } catch (e) {
                console.error('Failed to load STT settings:', e);
            }
        };
        if (isOpen) loadSttSettings();
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen || !window.electronAPI?.onSttCompareUpdate) return;

        return window.electronAPI.onSttCompareUpdate((results) => {
            setSttCompareResults(results);
        });
    }, [isOpen]);

    const handleSttProviderChange = async (provider: 'google' | 'groq' | 'openai' | 'deepgram' | 'elevenlabs' | 'azure' | 'ibmwatson' | 'soniox' | 'alibaba') => {
        setSttProvider(provider);
        setIsSttDropdownOpen(false);
        setSttTestStatus('idle');
        setSttTestError('');
        try {
            // @ts-ignore
            await window.electronAPI?.setSttProvider?.(provider);
        } catch (e) {
            console.error('Failed to set STT provider:', e);
        }
    };

    const handleSttKeySubmit = async (provider: 'groq' | 'openai' | 'deepgram' | 'elevenlabs' | 'azure' | 'ibmwatson' | 'soniox' | 'alibaba', key: string) => {
        if (!key.trim()) return;

        // Auto-test before saving
        setSttSaving(true);
        setSttTestStatus('testing');
        setSttTestError('');

        try {
            // @ts-ignore
            const testResult = await window.electronAPI?.testSttConnection?.(
                provider,
                key.trim(),
                provider === 'azure' ? sttAzureRegion : undefined
            );

            if (!testResult?.success) {
                setSttTestStatus('error');
                setSttTestError(testResult?.error || 'Validation failed. Key not saved.');
                setSttSaving(false);
                return; // Stop save
            }

            // If success, proceed to save
            setSttTestStatus('success');
            setTimeout(() => setSttTestStatus('idle'), 3000);

            if (provider === 'groq') {
                // @ts-ignore
                await window.electronAPI?.setGroqSttApiKey?.(key.trim());
            } else if (provider === 'openai') {
                // @ts-ignore
                await window.electronAPI?.setOpenAiSttApiKey?.(key.trim());
            } else if (provider === 'elevenlabs') {
                // @ts-ignore
                await window.electronAPI?.setElevenLabsApiKey?.(key.trim());
            } else if (provider === 'azure') {
                // @ts-ignore
                await window.electronAPI?.setAzureApiKey?.(key.trim());
            } else if (provider === 'ibmwatson') {
                // @ts-ignore
                await window.electronAPI?.setIbmWatsonApiKey?.(key.trim());
            } else if (provider === 'soniox') {
                // @ts-ignore
                await window.electronAPI?.setSonioxApiKey?.(key.trim());
            } else if (provider === 'alibaba') {
                // @ts-ignore
                await window.electronAPI?.setAlibabaSttApiKey?.(key.trim());
            } else {
                // @ts-ignore
                await window.electronAPI?.setDeepgramApiKey?.(key.trim());
            }
            if (provider === 'groq') setHasStoredSttGroqKey(true);
            else if (provider === 'openai') setHasStoredSttOpenaiKey(true);
            else if (provider === 'elevenlabs') setHasStoredElevenLabsKey(true);
            else if (provider === 'azure') setHasStoredAzureKey(true);
            else if (provider === 'ibmwatson') setHasStoredIbmWatsonKey(true);
            else if (provider === 'soniox') setHasStoredSonioxKey(true);
            else if (provider === 'alibaba') setHasStoredAlibabaKey(true);
            else setHasStoredDeepgramKey(true);

            setSttSaved(true);
            setTimeout(() => setSttSaved(false), 2000);
        } catch (e: any) {
            console.error(`Failed to save ${provider} STT key:`, e);
            setSttTestStatus('error');
            setSttTestError(e.message || 'Validation failed');
        } finally {
            setSttSaving(false);
        }
    };

    const handleRemoveSttKey = async (provider: 'groq' | 'openai' | 'deepgram' | 'elevenlabs' | 'azure' | 'ibmwatson' | 'soniox' | 'alibaba') => {
        if (!confirm(`Are you sure you want to remove the ${provider === 'ibmwatson' ? 'IBM Watson' : provider.charAt(0).toUpperCase() + provider.slice(1)} API key?`)) return;

        try {
            if (provider === 'groq') {
                // @ts-ignore
                await window.electronAPI?.setGroqSttApiKey?.('');
                setSttGroqKey('');
                setHasStoredSttGroqKey(false);
            } else if (provider === 'openai') {
                // @ts-ignore
                await window.electronAPI?.setOpenAiSttApiKey?.('');
                setSttOpenaiKey('');
                setHasStoredSttOpenaiKey(false);
            } else if (provider === 'elevenlabs') {
                // @ts-ignore
                await window.electronAPI?.setElevenLabsApiKey?.('');
                setSttElevenLabsKey('');
                setHasStoredElevenLabsKey(false);
            } else if (provider === 'azure') {
                // @ts-ignore
                await window.electronAPI?.setAzureApiKey?.('');
                setSttAzureKey('');
                setHasStoredAzureKey(false);
            } else if (provider === 'ibmwatson') {
                // @ts-ignore
                await window.electronAPI?.setIbmWatsonApiKey?.('');
                setSttIbmKey('');
                setHasStoredIbmWatsonKey(false);
            } else if (provider === 'soniox') {
                // @ts-ignore
                await window.electronAPI?.setSonioxApiKey?.('');
                setSttSonioxKey('');
                setHasStoredSonioxKey(false);
            } else if (provider === 'alibaba') {
                // @ts-ignore
                await window.electronAPI?.setAlibabaSttApiKey?.('');
                setSttAlibabaKey('');
                setHasStoredAlibabaKey(false);
            } else {
                // @ts-ignore
                await window.electronAPI?.setDeepgramApiKey?.('');
                setSttDeepgramKey('');
                setHasStoredDeepgramKey(false);
            }
        } catch (e) {
            console.error(`Failed to remove ${provider} STT key:`, e);
        }
    };

    const handleRemoveGoogleSearchKey = async (type: 'apikey' | 'cseid') => {
        if (!confirm(`确定要移除 Google Search 的 ${type === 'apikey' ? 'API 密钥' : 'CSE ID'} 吗？`)) return;

        try {
            if (type === 'apikey') {
                await window.electronAPI?.setGoogleSearchApiKey?.('');
                setGoogleSearchApiKey('');
                setHasStoredGoogleSearchKey(false);
            } else {
                await window.electronAPI?.setGoogleSearchCseId?.('');
                setGoogleSearchCseId('');
                setHasStoredGoogleSearchCseId(false);
            }
        } catch (e) {
            console.error(`Failed to remove Google Search ${type}:`, e);
        }
    };

    const handleTestSttConnection = async () => {
        if (sttProvider === 'google') return;
        const keyMap: Record<string, string> = {
            groq: sttGroqKey, openai: sttOpenaiKey, deepgram: sttDeepgramKey,
            elevenlabs: sttElevenLabsKey, azure: sttAzureKey, ibmwatson: sttIbmKey,
            soniox: sttSonioxKey, alibaba: sttAlibabaKey,
        };
        const keyToTest = keyMap[sttProvider] || '';
        if (!keyToTest.trim()) {
            setSttTestStatus('error');
            setSttTestError('请先输入 API 密钥');
            return;
        }

        setSttTestStatus('testing');
        setSttTestError('');
        try {
            // @ts-ignore
            const result = await window.electronAPI?.testSttConnection?.(
                sttProvider,
                keyToTest.trim(),
                sttProvider === 'azure' ? sttAzureRegion : undefined
            );
            if (result?.success) {
                setSttTestStatus('success');
                setTimeout(() => setSttTestStatus('idle'), 3000);
            } else {
                setSttTestStatus('error');
                setSttTestError(result?.error || '连接失败');
            }
        } catch (e: any) {
            setSttTestStatus('error');
            setSttTestError(e.message || '测试失败');
        }
    };

    const handleSaveTechnicalGlossary = async () => {
        setGlossarySaving(true);
        setGlossarySaveMessage('');
        try {
            const entries = technicalGlossaryText
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line) => {
                    const [term, weightPart] = line.split('|').map((part) => part.trim());
                    const parsedWeight = weightPart ? Number(weightPart) : undefined;
                    return {
                        term,
                        weight: Number.isFinite(parsedWeight) ? parsedWeight : undefined,
                    };
                });

            const result = await window.electronAPI?.setTechnicalGlossary?.({
                entries,
                alibabaWorkspaceId: alibabaWorkspaceId.trim() || undefined,
                alibabaVocabularyId: alibabaVocabularyId.trim() || undefined,
            });

            if (!result?.success) {
                setGlossarySaveMessage(result?.error || '保存热词表失败');
                return;
            }

            if (result.config?.alibabaVocabularyId) {
                setAlibabaVocabularyId(result.config.alibabaVocabularyId);
            }

            setGlossarySaveMessage(result?.warning || '已保存，热词更新会从下一句开始生效。');
            setGlossarySaved(true);
            setTimeout(() => setGlossarySaved(false), 2000);
        } catch (error) {
            console.error('Failed to save technical glossary:', error);
            setGlossarySaveMessage(error instanceof Error ? error.message : '保存热词表失败');
        } finally {
            setGlossarySaving(false);
        }
    };

    const handleStartSttCompare = async () => {
        setSttCompareBusy('starting');
        setSttCompareExportMessage('');
        try {
            await window.electronAPI?.startSttCompareSession?.();
            const results = await window.electronAPI?.getSttCompareResults?.();
            if (results) setSttCompareResults(results);
        } catch (error) {
            console.error('Failed to start STT compare session:', error);
        } finally {
            setSttCompareBusy('idle');
        }
    };

    const handleStopSttCompare = async () => {
        setSttCompareBusy('stopping');
        try {
            await window.electronAPI?.stopSttCompareSession?.();
            const results = await window.electronAPI?.getSttCompareResults?.();
            if (results) setSttCompareResults(results);
        } catch (error) {
            console.error('Failed to stop STT compare session:', error);
        } finally {
            setSttCompareBusy('idle');
        }
    };

    const handleExportSttBenchmark = async () => {
        setSttCompareBusy('exporting');
        setSttCompareExportMessage('');
        try {
            const result = await window.electronAPI?.exportSttBenchmarkReport?.();
            if (result?.success) {
                setSttCompareExportMessage(`JSON 报告：${result.jsonPath} | Markdown 报告：${result.markdownPath}`);
            } else {
                setSttCompareExportMessage(result?.error || '导出失败');
            }
        } catch (error: any) {
            console.error('Failed to export STT benchmark report:', error);
            setSttCompareExportMessage(error?.message || '导出失败');
        } finally {
            setSttCompareBusy('idle');
        }
    };


    const [calendarStatus, setCalendarStatus] = useState<{ connected: boolean; email?: string }>({ connected: false });
    const [isCalendarsLoading, setIsCalendarsLoading] = useState(false);

    const audioContextRef = React.useRef<AudioContext | null>(null);
    const analyserRef = React.useRef<AnalyserNode | null>(null);
    const sourceRef = React.useRef<MediaStreamAudioSourceNode | null>(null);
    const rafRef = React.useRef<number | null>(null);
    const streamRef = React.useRef<MediaStream | null>(null);

    // Load stored credentials on mount




    const handleCheckForUpdates = async () => {
        if (updateStatus === 'checking') return;
        setUpdateStatus('checking');
        try {
            await window.electronAPI.checkForUpdates();
        } catch (error) {
            console.error("Failed to check for updates:", error);
            setUpdateStatus('error');
            setTimeout(() => setUpdateStatus('idle'), 3000);
        }
    };

    useEffect(() => {
        if (!isOpen) return;

        const unsubs = [
            window.electronAPI.onUpdateChecking(() => {
                setUpdateStatus('checking');
            }),
            window.electronAPI.onUpdateAvailable(() => {
                setUpdateStatus('available');
                // Don't close settings - let user see the button change to "Update Available"
            }),
            window.electronAPI.onUpdateNotAvailable(() => {
                setUpdateStatus('uptodate');
                setTimeout(() => setUpdateStatus('idle'), 3000);
            }),
            window.electronAPI.onUpdateError((err) => {
                console.error('[Settings] Update error:', err);
                setUpdateStatus('error');
                setTimeout(() => setUpdateStatus('idle'), 3000);
            })
        ];

        return () => unsubs.forEach(unsub => unsub());
    }, [isOpen, onClose]);



    useEffect(() => {
        if (isOpen) {
            // Load detectable status
            if (window.electronAPI?.getUndetectable) {
                window.electronAPI.getUndetectable().then(setIsUndetectable);
            }
            if (window.electronAPI?.getOpenAtLogin) {
                window.electronAPI.getOpenAtLogin().then(setOpenOnLogin);
            }
            if (window.electronAPI?.getThemeMode) {
                window.electronAPI.getThemeMode().then(({ mode }) => setThemeMode(mode));
            }

            // Load settings
            const loadDevices = async () => {
                // Browser fallback when the native audio module is unavailable.
                const loadBrowserDevices = async () => {
                    let permissionStream: MediaStream | null = null;

                    try {
                        if (navigator.mediaDevices?.getUserMedia) {
                            permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                        }
                    } catch (permissionError) {
                        console.warn("Browser audio permission request failed:", permissionError);
                    }

                    try {
                        const devices = await navigator.mediaDevices.enumerateDevices();
                        const inputs = devices.filter(d => d.kind === 'audioinput');
                        const outputs = devices.filter(d => d.kind === 'audiooutput');
                        return { inputs, outputs };
                    } finally {
                        permissionStream?.getTracks().forEach(track => track.stop());
                    }
                };

                try {
                    let [inputs, outputs] = await Promise.all([
                        // @ts-ignore
                        window.electronAPI?.getInputDevices() || Promise.resolve([]),
                        // @ts-ignore
                        window.electronAPI?.getOutputDevices() || Promise.resolve([])
                    ]);

                    if ((!inputs || inputs.length === 0) && (!outputs || outputs.length === 0)) {
                        const browserDevices = await loadBrowserDevices();
                        inputs = browserDevices.inputs.map(d => ({ id: d.deviceId, name: d.label || 'Default Microphone' }));
                        outputs = browserDevices.outputs.map(d => ({ id: d.deviceId, name: d.label || 'Default Speaker' }));
                    }

                    // Map to shape compatible with CustomSelect (which expects MediaDeviceInfo-like objects)
                    const formatDevices = (devs: any[], kind: MediaDeviceKind) => devs.map(d => ({
                        deviceId: d.id,
                        label: d.name,
                        kind,
                        groupId: '',
                        toJSON: () => d
                    }));

                    setInputDevices(formatDevices(inputs, 'audioinput'));
                    setOutputDevices(formatDevices(outputs, 'audiooutput'));

                    // Load saved preferences
                    const savedInput = localStorage.getItem('preferredInputDeviceId');
                    const savedOutput = localStorage.getItem('preferredOutputDeviceId');

                    if (savedInput && inputs.find((d: any) => d.id === savedInput)) {
                        setSelectedInput(savedInput);
                    } else if (inputs.length > 0 && !selectedInput) {
                        setSelectedInput(inputs[0].id);
                    }

                    if (savedOutput && outputs.find((d: any) => d.id === savedOutput)) {
                        setSelectedOutput(savedOutput);
                    } else if (outputs.length > 0 && !selectedOutput) {
                        setSelectedOutput(outputs[0].id);
                    }
                } catch (e) {
                    console.error("Error loading native devices:", e);
                }
            };
            loadDevices();

            // Load Experimental SCK pref
            const savedSck = localStorage.getItem('useExperimentalSckBackend') === 'true';
            setUseExperimentalSck(savedSck);

            // Load Calendar Status
            if (window.electronAPI?.getCalendarStatus) {
                window.electronAPI.getCalendarStatus().then(setCalendarStatus);
            }
        }
    }, [isOpen, selectedInput, selectedOutput]); // Re-run if isOpen changes, or if selected devices are cleared

    // Effect for real-time audio level monitoring
    useEffect(() => {
        if (isOpen && activeTab === 'audio') {
            let mounted = true;
            let audioLevelUnsub: (() => void) | null = null;
            let nativeFallbackTimer: ReturnType<typeof setTimeout> | null = null;
            let usingNativeAudioTest = false;
            let nativeLevelSeen = false;
            let smoothLevel = 0;

            const cleanupBrowserAudio = () => {
                if (rafRef.current) cancelAnimationFrame(rafRef.current);
                if (sourceRef.current) sourceRef.current.disconnect();
                if (audioContextRef.current) {
                    audioContextRef.current.close();
                    audioContextRef.current = null;
                }
                if (streamRef.current) {
                    streamRef.current.getTracks().forEach(track => track.stop());
                    streamRef.current = null;
                }
            };

            const cleanupNativeAudio = () => {
                if (nativeFallbackTimer) {
                    clearTimeout(nativeFallbackTimer);
                    nativeFallbackTimer = null;
                }
                audioLevelUnsub?.();
                audioLevelUnsub = null;
                if (usingNativeAudioTest) {
                    // @ts-ignore
                    window.electronAPI?.stopAudioTest?.().catch((error: any) => {
                        console.error("Failed to stop native audio test:", error);
                    });
                }
            };

            const applySmoothedLevel = (targetLevel: number) => {
                if (targetLevel > smoothLevel) {
                    smoothLevel = smoothLevel * 0.7 + targetLevel * 0.3;
                } else {
                    smoothLevel = smoothLevel * 0.95 + targetLevel * 0.05;
                }

                setMicLevel(smoothLevel);
            };

            const startBrowserAudio = async () => {
                let initialStream: MediaStream | null = null;
                try {
                    // Cleanup previous audio context if it exists
                    if (audioContextRef.current) {
                        audioContextRef.current.close();
                    }

                    // Request permission first so device labels are populated, then map the
                    // selected native device id/name back to a browser MediaDevice id.
                    initialStream = await navigator.mediaDevices.getUserMedia({ audio: true });

                    let stream = initialStream;
                    const browserDevices = await navigator.mediaDevices.enumerateDevices();
                    const browserInputs = browserDevices.filter((device) => device.kind === 'audioinput');
                    const normalizedSelectedInput = selectedInput.trim().toLowerCase();
                    const matchedBrowserInput = normalizedSelectedInput
                        ? browserInputs.find((device) => {
                            const browserId = device.deviceId.trim().toLowerCase();
                            const browserLabel = device.label.trim().toLowerCase();
                            return browserId === normalizedSelectedInput || browserLabel === normalizedSelectedInput;
                        })
                        : null;

                    if (matchedBrowserInput?.deviceId && matchedBrowserInput.deviceId !== 'default') {
                        initialStream.getTracks().forEach(track => track.stop());
                        initialStream = null;
                        stream = await navigator.mediaDevices.getUserMedia({
                            audio: {
                                deviceId: { exact: matchedBrowserInput.deviceId }
                            }
                        });
                    }

                    streamRef.current = stream;

                    if (!mounted) return;

                    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                    const analyser = audioContext.createAnalyser();
                    const source = audioContext.createMediaStreamSource(stream);

                    analyser.fftSize = 256;
                    source.connect(analyser);

                    audioContextRef.current = audioContext;
                    analyserRef.current = analyser;
                    sourceRef.current = source;

                    const dataArray = new Uint8Array(analyser.frequencyBinCount);

                    const updateLevel = () => {
                        if (!mounted || !analyserRef.current) return;
                        // Use Time Domain Data for accurate volume (waveform) instead of frequency
                        analyserRef.current.getByteTimeDomainData(dataArray);

                        let sum = 0;
                        for (let i = 0; i < dataArray.length; i++) {
                            // Convert 0-255 to -1 to 1 range
                            const value = (dataArray[i] - 128) / 128;
                            sum += value * value;
                        }

                        // Calculate RMS
                        const rms = Math.sqrt(sum / dataArray.length);

                        // Convert to simpler 0-100 range with some boost
                        // RMS is usually very small (0.01 - 0.5 for normal speech)
                        // Logarithmic scaling feels more natural for volume
                        const db = 20 * Math.log10(rms);
                        // Approximate mapping: -60dB (silence) to 0dB (max) -> 0 to 100
                        const targetLevel = Math.max(0, Math.min(100, (db + 60) * 2));

                        applySmoothedLevel(targetLevel);

                        rafRef.current = requestAnimationFrame(updateLevel);
                    };

                    updateLevel();
                } catch (error) {
                    console.error("Error accessing microphone:", error);
                    initialStream?.getTracks().forEach(track => track.stop());
                    setMicLevel(0); // Reset level on error
                }
            };

            const startNativeAudio = async () => {
                if (!window.electronAPI?.startAudioTest || !window.electronAPI?.onAudioTestLevel) {
                    return false;
                }

                usingNativeAudioTest = true;
                audioLevelUnsub = window.electronAPI.onAudioTestLevel((level) => {
                    if (!mounted) return;
                    nativeLevelSeen = true;
                    applySmoothedLevel(Math.max(0, Math.min(100, level * 100)));
                });

                try {
                    await window.electronAPI.startAudioTest(selectedInput || undefined);

                    nativeFallbackTimer = setTimeout(() => {
                        if (!mounted || nativeLevelSeen) return;

                        cleanupNativeAudio();
                        usingNativeAudioTest = false;
                        startBrowserAudio();
                    }, 1500);

                    return true;
                } catch (error) {
                    console.error("Failed to start native audio test:", error);
                    cleanupNativeAudio();
                    usingNativeAudioTest = false;
                    return false;
                }
            };

            startNativeAudio().then((started) => {
                if (!started) {
                    startBrowserAudio();
                }
            });

            return () => {
                mounted = false;
                cleanupNativeAudio();
                cleanupBrowserAudio();
                setMicLevel(0); // Reset mic level on cleanup
            };
        } else {
            // Cleanup when closing tab or overlay or switching away from audio tab
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            if (sourceRef.current) sourceRef.current.disconnect(); // Disconnect source as well
            if (audioContextRef.current) {
                audioContextRef.current.close();
                audioContextRef.current = null;
            }
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
            }
            setMicLevel(0);
        }
    }, [isOpen, activeTab, selectedInput]);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    id="settings-backdrop"
                    className={`fixed inset-0 z-50 flex items-center justify-center p-8 transition-colors duration-150 ${isPreviewingOpacity ? 'bg-transparent backdrop-blur-none' : 'bg-black/60 backdrop-blur-sm'}`}
                >
                    <motion.div
                        id="settings-panel-wrapper"
                        initial={{ scale: 0.94, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.94, opacity: 0, y: 20 }}
                        transition={{ 
                            type: "spring", 
                            stiffness: 400, 
                            damping: 32,
                            mass: 1
                        }}
                        className="bg-bg-elevated w-full max-w-4xl h-[80vh] rounded-2xl border border-border-subtle shadow-2xl overflow-hidden relative"
                    >
                        <div 
                            id="settings-panel" 
                            className="flex w-full h-full"
                            style={{ visibility: isPreviewingOpacity ? 'hidden' : 'visible' }}
                        >
                        {/* Sidebar */}
                        <div className="w-64 bg-bg-sidebar flex flex-col border-r border-border-subtle">
                            <div className="p-6">
                                <h2 className="font-semibold text-gray-400 text-xs uppercase tracking-wider mb-2">设置</h2>
                                <nav className="space-y-1">
                                    <button
                                        onClick={() => setActiveTab('general')}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-3 ${activeTab === 'general' ? 'bg-bg-item-active text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-bg-item-active/50'}`}
                                    >
                                        <Monitor size={16} /> 通用
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('ai-providers')}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-3 ${activeTab === 'ai-providers' ? 'bg-bg-item-active text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-bg-item-active/50'}`}
                                    >
                                        <FlaskConical size={16} /> AI 提供商
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('calendar')}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-3 ${activeTab === 'calendar' ? 'bg-bg-item-active text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-bg-item-active/50'}`}
                                    >
                                        <Calendar size={16} /> 日历
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('audio')}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-3 ${activeTab === 'audio' ? 'bg-bg-item-active text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-bg-item-active/50'}`}
                                    >
                                        <Mic size={16} /> 音频
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('keybinds')}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-3 ${activeTab === 'keybinds' ? 'bg-bg-item-active text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-bg-item-active/50'}`}
                                    >
                                        <Keyboard size={16} /> 快捷键
                                    </button>
                                    <button
                                        onClick={() => {
                                            setActiveTab('profile');
                                            // Load profile status when switching to this tab
                                            window.electronAPI?.profileGetStatus?.().then(setProfileStatus).catch(() => { });
                                            window.electronAPI?.profileGetProfile?.().then(setProfileData).catch(() => { });
                                        }}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-3 ${activeTab === 'profile' ? 'bg-bg-item-active text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-bg-item-active/50'}`}
                                    >
                                        <User size={16} /> Project Library
                                    </button>

                                    <button
                                        onClick={() => setActiveTab('about')}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-3 ${activeTab === 'about' ? 'bg-bg-item-active text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-bg-item-active/50'}`}
                                    >
                                        <Info size={16} /> 关于
                                    </button>
                                </nav>
                            </div>

                            <div className="mt-auto p-6 border-t border-border-subtle">
                                <button
                                    onClick={() => window.electronAPI.quitApp()}
                                    className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-3"
                                >
                                    <LogOut size={16} /> Quit Natively
                                </button>
                                <button onClick={onClose} className="group mt-2 w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-bg-item-active/50 transition-colors flex items-center gap-3">
                                    <X size={18} className="group-hover:text-red-500 transition-colors" /> Close
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto bg-bg-main p-8">
                            {activeTab === 'general' && (
                                <div className="space-y-6 animated fadeIn">
                                    <div className="space-y-3.5">
                                        {/* UndetectableToggle */}
                                        <div className={`bg-bg-item-surface rounded-xl p-5 border border-border-subtle flex items-center justify-between transition-all ${isUndetectable ? 'shadow-lg shadow-blue-500/10' : ''}`}>
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2">
                                                    {isUndetectable ? (
                                                        <svg
                                                            width="18"
                                                            height="18"
                                                            viewBox="0 0 24 24"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            strokeWidth="2"
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            className="text-text-primary"
                                                        >
                                                            <path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z" fill="currentColor" stroke="currentColor" />
                                                            <path d="M9 10h.01" stroke="var(--bg-item-surface)" strokeWidth="2.5" />
                                                            <path d="M15 10h.01" stroke="var(--bg-item-surface)" strokeWidth="2.5" />
                                                        </svg>
                                                    ) : (
                                                        <Ghost size={18} className="text-text-primary" />
                                                    )}
                                                    <h3 className="text-lg font-bold text-text-primary">{isUndetectable ? '不可检测' : '可检测'}</h3>
                                                </div>
                                                <p className="text-xs text-text-secondary">
                                                    当前在屏幕共享时，Natively {isUndetectable ? '不会被检测到' : '可能会被检测到'}。<button className="text-blue-400 hover:underline">查看支持的应用</button>
                                                </p>
                                            </div>
                                            <div
                                                onClick={() => {
                                                    const newState = !isUndetectable;
                                                    setIsUndetectable(newState);
                                                    window.electronAPI?.setUndetectable(newState);
                                                    // Analytics: Undetectable Mode Toggle
                                                    analytics.trackModeSelected(newState ? 'undetectable' : 'overlay');
                                                }}
                                                className={`w-11 h-6 rounded-full relative transition-colors ${isUndetectable ? 'bg-accent-primary' : 'bg-bg-toggle-switch border border-border-muted'}`}
                                            >
                                                <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${isUndetectable ? 'translate-x-5' : 'translate-x-0'}`} />
                                            </div>
                                        </div>

                                        <div>
                                            <h3 className="text-lg font-bold text-text-primary mb-1">常规设置</h3>
                                            <p className="text-xs text-text-secondary mb-2">按你的使用习惯调整 Natively</p>

                                            <div className="space-y-4">
                                                {/* Open at Login */}
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 bg-bg-item-surface rounded-lg border border-border-subtle flex items-center justify-center text-text-tertiary">
                                                            <Power size={20} />
                                                        </div>
                                                        <div>
                                                            <h3 className="text-sm font-bold text-text-primary">登录后自动打开 Natively</h3>
                                                            <p className="text-xs text-text-secondary mt-0.5">当你登录电脑时，Natively 会自动启动</p>
                                                        </div>
                                                    </div>
                                                    <div
                                                        onClick={() => {
                                                            const newState = !openOnLogin;
                                                            setOpenOnLogin(newState);
                                                            window.electronAPI?.setOpenAtLogin(newState);
                                                        }}
                                                        className={`w-11 h-6 rounded-full relative transition-colors ${openOnLogin ? 'bg-accent-primary' : 'bg-bg-toggle-switch border border-border-muted'}`}
                                                    >
                                                        <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${openOnLogin ? 'translate-x-5' : 'translate-x-0'}`} />
                                                    </div>
                                                </div>

                                                {/* Theme */}
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 bg-bg-item-surface rounded-lg border border-border-subtle flex items-center justify-center text-text-tertiary">
                                                            <Palette size={20} />
                                                        </div>
                                                        <div>
                                                            <h3 className="text-sm font-bold text-text-primary">主题</h3>
                                                            <p className="text-xs text-text-secondary mt-0.5">调整 Natively 在你设备上的显示风格</p>
                                                        </div>
                                                    </div>

                                                    <div className="relative" ref={themeDropdownRef}>
                                                        <button
                                                            onClick={() => setIsThemeDropdownOpen(!isThemeDropdownOpen)}
                                                            className="bg-bg-component hover:bg-bg-elevated border border-border-subtle text-text-primary px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 min-w-[110px] justify-between"
                                                        >
                                                            <div className="flex items-center gap-2 overflow-hidden">
                                                                <span className="text-text-secondary shrink-0">
                                                                    {themeMode === 'system' && <Monitor size={14} />}
                                                                    {themeMode === 'light' && <Sun size={14} />}
                                                                    {themeMode === 'dark' && <Moon size={14} />}
                                                                </span>
                                                                <span className="capitalize text-ellipsis overflow-hidden whitespace-nowrap">{themeMode}</span>
                                                            </div>
                                                            <ChevronDown size={12} className={`shrink-0 transition-transform ${isThemeDropdownOpen ? 'rotate-180' : ''}`} />
                                                        </button>

                                                        {/* Dropdown Menu */}
                                                        {isThemeDropdownOpen && (
                                                            <div className="absolute right-0 top-full mt-1 min-w-full w-max bg-bg-elevated border border-border-subtle rounded-lg shadow-xl overflow-hidden z-20 p-1 animated fadeIn select-none">
                                                                {[
                                                                    { mode: 'system', label: 'System', icon: <Monitor size={14} /> },
                                                                    { mode: 'light', label: 'Light', icon: <Sun size={14} /> },
                                                                    { mode: 'dark', label: 'Dark', icon: <Moon size={14} /> }
                                                                ].map((option) => (
                                                                    <button
                                                                        key={option.mode}
                                                                        onClick={() => {
                                                                            handleSetTheme(option.mode as any);
                                                                            setIsThemeDropdownOpen(false);
                                                                        }}
                                                                        className={`w-full text-left px-2 py-1.5 rounded-md text-xs flex items-center gap-2 transition-colors ${themeMode === option.mode ? 'text-text-primary bg-bg-item-active/50' : 'text-text-secondary hover:bg-bg-input hover:text-text-primary'}`}
                                                                    >
                                                                        <span className={themeMode === option.mode ? 'text-text-primary' : 'text-text-secondary group-hover:text-text-primary'}>{option.icon}</span>
                                                                        <span className="font-medium">{option.label}</span>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* AI Response Language */}
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 bg-bg-item-surface rounded-lg border border-border-subtle flex items-center justify-center text-text-tertiary">
                                                            <Globe size={20} />
                                                        </div>
                                                        <div>
                                                            <h3 className="text-sm font-bold text-text-primary">AI 回复语言</h3>
                                                            <p className="text-xs text-text-secondary mt-0.5">AI 建议和笔记的输出语言</p>
                                                        </div>
                                                    </div>

                                                    <div className="relative" ref={aiLangDropdownRef}>
                                                        <button
                                                            onClick={() => setIsAiLangDropdownOpen(!isAiLangDropdownOpen)}
                                                            className="bg-bg-component hover:bg-bg-elevated border border-border-subtle text-text-primary pl-4 pr-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 min-w-[110px] justify-between"
                                                        >
                                                            <span className="capitalize text-ellipsis overflow-hidden whitespace-nowrap">
                                                                {aiResponseLanguage}
                                                            </span>
                                                            <ChevronDown size={12} className={`shrink-0 transition-transform ${isAiLangDropdownOpen ? 'rotate-180' : ''}`} />
                                                        </button>

                                                        {/* Dropdown Menu */}
                                                        {isAiLangDropdownOpen && (
                                                            <div className="absolute right-0 top-full mt-1 min-w-full w-max bg-bg-elevated border border-border-subtle rounded-lg shadow-xl overflow-hidden z-20 p-1 animated fadeIn select-none max-h-60 overflow-y-auto custom-scrollbar">
                                                                {availableAiLanguages.map((option) => (
                                                                    <button
                                                                        key={option.code}
                                                                        onClick={() => {
                                                                            handleAiLanguageChange(option.code);
                                                                            setIsAiLangDropdownOpen(false);
                                                                        }}
                                                                        className={`w-full text-left px-2 py-1.5 rounded-md text-xs flex items-center gap-2 transition-colors ${aiResponseLanguage === option.code ? 'text-text-primary bg-bg-item-active/50' : 'text-text-secondary hover:bg-bg-input hover:text-text-primary'}`}
                                                                    >
                                                                        <span className="font-medium">{option.label}</span>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Version */}
                                                <div className="flex items-start justify-between gap-4">
                                                    <div className="flex items-start gap-4">
                                                        <div className="w-10 h-10 bg-bg-item-surface rounded-lg border border-border-subtle flex items-center justify-center text-text-tertiary shrink-0">
                                                            <BadgeCheck size={20} />
                                                        </div>
                                                        <div>
                                                            <h3 className="text-sm font-bold text-text-primary">版本</h3>
                                                            <p className="text-xs text-text-secondary mt-0.5">
                                                                你当前使用的是 Natively v{packageJson.version}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={async () => {
                                                            if (updateStatus === 'available') {
                                                                try {
                                                                    // @ts-ignore
                                                                    await window.electronAPI.downloadUpdate();
                                                                    onClose(); // Close settings to show the banner
                                                                } catch (err) {
                                                                    console.error("Failed to start download:", err);
                                                                }
                                                            } else {
                                                                handleCheckForUpdates();
                                                            }
                                                        }}
                                                        disabled={updateStatus === 'checking'}
                                                        className={`px-5 py-2 rounded-lg text-[13px] font-bold transition-all flex items-center gap-2 shrink-0 ${updateStatus === 'checking' ? 'bg-bg-input text-text-tertiary cursor-wait' :
                                                            updateStatus === 'available' ? 'bg-accent-primary text-white hover:bg-accent-secondary shadow-lg shadow-blue-500/20' :
                                                                updateStatus === 'uptodate' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                                                                    updateStatus === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                                                                        'bg-bg-component hover:bg-bg-input text-text-primary'
                                                            }`}
                                                    >
                                                        {updateStatus === 'checking' ? (
                                                            <>
                                                                <RefreshCw size={14} className="animate-spin" />
                                                                正在检查...
                                                            </>
                                                        ) : updateStatus === 'available' ? (
                                                            <>
                                                                <ArrowDown size={14} />
                                                                发现新版本
                                                            </>
                                                        ) : updateStatus === 'uptodate' ? (
                                                            <>
                                                                <Check size={14} />
                                                                已是最新
                                                            </>
                                                        ) : updateStatus === 'error' ? (
                                                            <>
                                                                <X size={14} />
                                                                错误
                                                            </>
                                                        ) : (
                                                            <>
                                                                <RefreshCw size={14} />
                                                                检查更新
                                                            </>
                                                        )}
                                                    </button>
                                                </div>

                                                {/* ------------------------------------------------------------------ */}
                                                {/* Interface Opacity (Stealth Mode)                                   */}
                                                {/* ------------------------------------------------------------------ */}
                                                <div
                                                    id="opacity-slider-card"
                                                    style={isPreviewingOpacity ? { visibility: 'visible', position: 'relative', zIndex: 9999 } : {}}
                                                    className="bg-bg-item-surface rounded-xl p-5 border border-border-subtle mt-4"
                                                >
                                                    <div className="flex items-center justify-between mb-3">
                                                        <label className="flex items-center gap-2 text-xs font-medium text-text-secondary uppercase tracking-wide">
                                                            <Eye size={13} className="text-text-secondary" />
                                                            界面透明度
                                                        </label>
                                                        <span className="opacity-percent-label text-xs font-semibold text-text-primary tabular-nums">
                                                            {Math.round(overlayOpacity * 100)}%
                                                        </span>
                                                    </div>

                                                    <input
                                                        type="range"
                                                        min={0.35}
                                                        max={1.0}
                                                        step={0.01}
                                                        defaultValue={overlayOpacity}
                                                        onChange={(e) => handleOpacityChange(parseFloat(e.target.value))}
                                                        onPointerDown={startPreviewingOpacity}
                                                        onPointerUp={stopPreviewingOpacity}
                                                        onPointerCancel={stopPreviewingOpacity}
                                                        onPointerLeave={stopPreviewingOpacity}
                                                        className="w-full h-1.5 rounded-full appearance-none bg-bg-input accent-accent-primary"
                                                        style={{ WebkitAppearance: 'none' } as React.CSSProperties}
                                                    />

                                                    <div className="flex justify-between mt-1.5">
                                                        <span className="text-[10px] text-text-tertiary">更强隐蔽性</span>
                                                        <span className="text-[10px] text-text-tertiary">完全可见</span>
                                                    </div>

                                                    <p className="text-xs text-text-tertiary mt-2">
                                                        控制会议中悬浮层的可见程度。{' '}
                                                        <span className="text-text-secondary">按住滑块即可预览效果。</span>
                                                    </p>
                                                </div>

                                            </div>
                                        </div>

                                    </div>

                                    {/* Process Disguise */}
                                    {/* Process Disguise */}
                                    <div className="bg-bg-item-surface rounded-xl p-5 border border-border-subtle">
                                        <div className="flex flex-col gap-1 mb-3">
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-lg font-bold text-text-primary">进程伪装</h3>
                                            </div>
                                            <p className="text-xs text-text-secondary">
                                                将 Natively 伪装成其他应用，以减少屏幕共享时被发现的概率。
                                                <span className="block mt-1 text-text-tertiary">
                                                    选择在开启 Undetectable mode 时自动启用的伪装方式。
                                                </span>
                                            </p>
                                        </div>

                                        <div className={`grid grid-cols-2 gap-3 ${isUndetectable ? 'opacity-50 pointer-events-none' : ''}`}>
                                            {isUndetectable && (
                                                <p className="col-span-2 text-xs text-yellow-500/80 -mt-1 mb-1">
                                                    ⚠️ 请先关闭 Undetectable mode，再修改伪装样式。
                                                </p>
                                            )}
                                            {[
                                                { id: 'none', label: '无（默认）', icon: <Layout size={14} /> },
                                                { id: 'terminal', label: '终端', icon: <Terminal size={14} /> },
                                                { id: 'settings', label: '系统设置', icon: <Settings size={14} /> },
                                                { id: 'activity', label: '活动监视器', icon: <Activity size={14} /> }
                                            ].map((option) => (
                                                <button
                                                    key={option.id}
                                                    disabled={isUndetectable}
                                                    onClick={() => {
                                                        if (isUndetectable) return;
                                                        // @ts-ignore
                                                        setDisguiseMode(option.id);
                                                        // @ts-ignore
                                                        window.electronAPI?.setDisguise(option.id);
                                                        // Analytics
                                                        analytics.trackModeSelected(`disguise_${option.id}`);
                                                    }}
                                                    className={`p-3 rounded-lg border text-left flex items-center gap-3 transition-all ${disguiseMode === option.id
                                                        ? 'bg-accent-primary border-accent-primary text-white shadow-lg shadow-blue-500/20'
                                                        : 'bg-bg-input border-border-subtle text-text-secondary hover:text-text-primary hover:bg-bg-subtle-hover'
                                                        } ${isUndetectable ? 'cursor-not-allowed' : ''}`}
                                                >
                                                    <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${disguiseMode === option.id ? 'bg-white/20 text-white' : 'bg-bg-item-surface text-text-secondary'
                                                        }`}>
                                                        {option.icon}
                                                    </div>
                                                    <span className="text-xs font-medium">{option.label}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                </div>
                            )}
                            {activeTab === 'profile' && (
                                <div className="space-y-6 animated fadeIn">
                                    {/* Introduction */}
                                    <div className="mb-5">
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-2">
                                            <h3 className="text-sm font-bold text-text-primary">职业画像</h3>
                                                <span className="bg-yellow-500/10 text-yellow-500 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">测试中</span>
                                            </div>
                                            <div className="text-[11px] font-semibold flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-500">
                                                <CheckCircle size={12} />
                                                Project Context
                                            </div>
                                        </div>
                                        <p className="text-xs text-text-secondary mb-2">
                                            Build a project-scoped knowledge library for interview deep dives.
                                        </p>
                                    </div>

                                    {/* Intelligence Graph Hero Card */}
                                    <div className="bg-bg-item-surface rounded-xl border border-border-subtle flex flex-col justify-between overflow-hidden">
                                        <div className="flex flex-col justify-between min-h-[160px]">

                                            {/* Header */}
                                            <div className="p-5 pb-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 rounded-full bg-bg-input border border-border-subtle flex items-center justify-center text-text-primary shadow-sm hover:scale-105 transition-transform duration-300">
                                                            <span className="font-bold text-sm tracking-tight">
                                                                {profileData?.identity?.name ? profileData.identity.name.charAt(0).toUpperCase() : 'U'}
                                                            </span>
                                                        </div>
                                                        <div>
                                                            <h4 className="text-sm font-bold text-text-primary tracking-tight">
                                                                {profileData?.identity?.name || 'Identity Node Inactive'}
                                                            </h4>
                                                            <p className="text-xs text-text-secondary mt-0.5 tracking-wide">
                                                                {profileData?.identity?.email || 'Upload a resume to create your project library.'}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-3">
                                                        {profileStatus.hasProfile && (
                                                            <button
                                                                onClick={async () => {
                                                                    if (!confirm('Are you sure you want to delete your mapped persona? This will destroy all structured timeline data.')) return;
                                                                    try {
                                                                        await window.electronAPI?.profileDelete?.();
                                                                        setProfileStatus({ hasProfile: false, profileMode: false });
                                                                        setProfileData(null);
                                                                    } catch (e) { console.error('Failed to delete profile:', e); }
                                                                }}
                                                                className="text-[12px] font-medium text-text-tertiary hover:text-red-500 transition-colors px-3 py-1.5 rounded-full hover:bg-red-500/10"
                                                            >
                                                                断开连接
                                                            </button>
                                                        )}

                                                        {/* High-fidelity Toggle */}
                                                        <div className="flex items-center gap-2 bg-bg-input px-3 py-1.5 rounded-full border border-border-subtle">
                                            <span className="text-xs font-medium text-text-secondary">画像引擎</span>
                                                            <div
                                                                onClick={async () => {
                                                                    if (!profileStatus.hasProfile) return;
                                                                    const newState = !profileStatus.profileMode;
                                                                    try {
                                                                        await window.electronAPI?.profileSetMode?.(newState);
                                                                        setProfileStatus(prev => ({ ...prev, profileMode: newState }));
                                                                    } catch (e) {
                                                                        console.error('Failed to toggle profile mode:', e);
                                                                    }
                                                                }}
                                                                className={`w-9 h-5 rounded-full relative transition-colors ${!profileStatus.hasProfile ? 'opacity-40 cursor-not-allowed bg-bg-toggle-switch' : profileStatus.profileMode ? 'bg-accent-primary' : 'bg-bg-toggle-switch border border-border-muted'}`}
                                                            >
                                                                <div className={`absolute top-1 left-1 w-3 h-3 rounded-full bg-white transition-transform ${profileStatus.profileMode ? 'translate-x-4' : 'translate-x-0'}`} />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Data Metrics & Extracted Skills */}
                                            <div className="p-5 pt-0 mt-auto">
                                                <div className="flex items-center justify-between bg-bg-item-surface dark:bg-[#1A1A1A] border border-border-subtle py-4 px-6 rounded-2xl shadow-sm">
                                                    <div className="flex flex-col items-center justify-center flex-1">
                                                        <span className="text-[20px] font-bold text-text-primary tracking-tight leading-none mb-1">{profileData?.experienceCount || 0}</span>
                                                        <div className="flex items-center gap-1.5">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
                                                <span className="text-[10px] font-semibold text-text-secondary uppercase tracking-widest">经历</span>
                                                        </div>
                                                    </div>

                                                    <div className="h-8 w-px bg-border-subtle/60" />

                                                    <div className="flex flex-col items-center justify-center flex-1">
                                                        <span className="text-[20px] font-bold text-text-primary tracking-tight leading-none mb-1">{profileData?.projectCount || 0}</span>
                                                        <div className="flex items-center gap-1.5">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]" />
                                                <span className="text-[10px] font-semibold text-text-secondary uppercase tracking-widest">项目</span>
                                                        </div>
                                                    </div>

                                                    <div className="h-8 w-px bg-border-subtle/60" />

                                                    <div className="flex flex-col items-center justify-center flex-1">
                                                        <span className="text-[20px] font-bold text-text-primary tracking-tight leading-none mb-1">{profileData?.nodeCount || 0}</span>
                                                        <div className="flex items-center gap-1.5">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.4)]" />
                                                <span className="text-[10px] font-semibold text-text-secondary uppercase tracking-widest">节点</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {profileData?.skills && profileData.skills.length > 0 && (
                                                    <div className="mt-5">
                                                        <div className="text-[10px] font-bold text-text-primary uppercase tracking-wide mb-2">
                                                            Top Skills
                                                        </div>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {profileData.skills.slice(0, 15).map((skill: string, i: number) => (
                                                                <span key={i} className="text-[10px] font-medium text-text-secondary px-2 py-1 rounded-md border border-border-subtle bg-bg-input">
                                                                    {skill}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Upload Area */}
                                    <div className="mt-5">
                                        <div className={`bg-bg-item-surface rounded-xl border transition-all ${profileUploading ? 'border-accent-primary/50 ring-1 ring-accent-primary/20' : 'border-border-subtle'}`}>
                                            <div className="p-5 flex items-center justify-between">
                                                <div className="flex items-center gap-4 min-w-0">
                                                    <div className="w-10 h-10 rounded-lg bg-bg-input border border-border-subtle flex items-center justify-center text-text-tertiary shrink-0">
                                                        {profileUploading ? <RefreshCw size={20} className="animate-spin text-accent-primary" /> : <Upload size={20} />}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h4 className="text-sm font-bold text-text-primary mb-0.5 truncate pr-4">
                                                            {profileStatus.hasProfile ? 'Overwrite Source Document' : 'Initialize Knowledge Base'}
                                                        </h4>
                                                        {profileUploading ? (
                                                            <div className="flex items-center gap-2">
                                                                <div className="h-[4px] w-[100px] bg-bg-input rounded-full overflow-hidden">
                                                                    <div className="h-full bg-accent-primary rounded-full animate-pulse" style={{ width: '50%' }} />
                                                                </div>
                                                            <span className="text-[10px] text-text-secondary tracking-wide">正在分析结构语义...</span>
                                                            </div>
                                                        ) : (
                                                            <p className="text-xs text-text-secondary truncate pr-4">
                                                                Upload a resume to seed 2 to 3 interview projects.
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={async () => {
                                                        setProfileError('');
                                                        try {
                                                            const fileResult = await window.electronAPI?.profileSelectFile?.();
                                                            if (fileResult?.cancelled || !fileResult?.filePath) return;

                                                            setProfileUploading(true);
                                                            const result = await window.electronAPI?.profileUploadResume?.(fileResult.filePath);
                                                            if (result?.success) {
                                                                const status = await window.electronAPI?.profileGetStatus?.();
                                                                if (status) setProfileStatus(status);
                                                                const data = await window.electronAPI?.profileGetProfile?.();
                                                                if (data) setProfileData(data);
                                                            } else {
                                                                setProfileError(result?.error || 'Upload failed');
                                                            }
                                                        } catch (e: any) {
                                                            setProfileError(e.message || 'Upload failed');
                                                        } finally {
                                                            setProfileUploading(false);
                                                        }
                                                    }}
                                                    disabled={profileUploading}
                                                    className={`px-4 py-2 rounded-full text-xs font-medium transition-all whitespace-nowrap shrink-0 ${profileUploading ? 'bg-bg-input text-text-tertiary cursor-wait border border-border-subtle' : 'bg-text-primary text-bg-main hover:opacity-90 shadow-sm'}`}
                                                >
                                                    {profileUploading ? 'Ingesting...' : 'Select File'}
                                                </button>
                                            </div>

                                            {profileError && (
                                                <div className="px-5 pb-4">
                                                    <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-[11px] text-red-500 font-medium">
                                                        <X size={12} /> {profileError}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* JD Upload Card */}
                                    <div className="mt-5">
                                        <div className={`rounded-xl transition-all border ${jdUploading ? 'border-blue-500/50 ring-1 ring-blue-500/20 bg-bg-item-surface' : profileData?.hasActiveJD ? 'border-blue-500/30 bg-blue-500/5' : 'border-border-subtle bg-bg-item-surface'}`}>
                                            <div className="p-5 flex items-center justify-between">
                                                <div className="flex items-center gap-4 min-w-0">
                                                    <div className="w-10 h-10 rounded-lg bg-bg-input border border-border-subtle flex items-center justify-center text-text-tertiary shrink-0">
                                                        {jdUploading ? <RefreshCw size={20} className="animate-spin text-blue-500" /> : <Briefcase size={20} />}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h4 className="text-sm font-bold text-text-primary mb-0.5 truncate pr-4">
                                                            {profileData?.hasActiveJD ? `${profileData.activeJD?.title} @ ${profileData.activeJD?.company}` : 'Upload Job Description'}
                                                        </h4>
                                                        {jdUploading ? (
                                                            <div className="flex items-center gap-2">
                                                                <div className="h-[4px] w-[100px] bg-bg-input rounded-full overflow-hidden">
                                                                    <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: '50%' }} />
                                                                </div>
                                                            <span className="text-[10px] text-text-secondary tracking-wide">正在解析 JD 结构...</span>
                                                            </div>
                                                        ) : profileData?.hasActiveJD ? (
                                                            <div className="flex items-center gap-3">
                                                                <span className="text-[9px] font-bold text-blue-500 px-1.5 py-0.5 bg-blue-500/10 rounded uppercase tracking-wide border border-blue-500/20">
                                                                    {profileData.activeJD?.level || 'mid'}-level
                                                                </span>
                                                                <div className="flex gap-1.5">
                                                                    {profileData.activeJD?.technologies?.slice(0, 3).map((t: string, i: number) => (
                                                                        <span key={i} className="text-[10px] text-text-secondary">{t}</span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <p className="text-xs text-text-secondary">
                                                            Upload a JD as an optional ranking and wording bias. Facts still come from your project library.
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 shrink-0">
                                                    {profileData?.hasActiveJD && (
                                                        <button
                                                            onClick={async () => {
                                                                await window.electronAPI?.profileDeleteJD?.();
                                                                const data = await window.electronAPI?.profileGetProfile?.();
                                                                if (data) setProfileData(data);
                                                                setCompanyDossier(null);
                                                            }}
                                                            className="px-2.5 py-2 rounded-full text-xs text-text-tertiary hover:text-red-500 hover:bg-red-500/10 transition-all border border-transparent hover:border-red-500/20"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={async () => {
                                                            setJdError('');
                                                            try {
                                                                const fileResult = await window.electronAPI?.profileSelectFile?.();
                                                                if (fileResult?.cancelled || !fileResult?.filePath) return;

                                                                setJdUploading(true);
                                                                const result = await window.electronAPI?.profileUploadJD?.(fileResult.filePath);
                                                                if (result?.success) {
                                                                    const data = await window.electronAPI?.profileGetProfile?.();
                                                                    if (data) setProfileData(data);
                                                                } else {
                                                                    setJdError(result?.error || 'JD upload failed');
                                                                }
                                                            } catch (e: any) {
                                                                setJdError(e.message || 'JD upload failed');
                                                            } finally {
                                                                setJdUploading(false);
                                                            }
                                                        }}
                                                        disabled={jdUploading}
                                                        className={`px-4 py-2 rounded-full text-xs font-medium transition-all whitespace-nowrap shrink-0 ${jdUploading ? 'bg-bg-input text-text-tertiary cursor-wait border border-border-subtle' : 'bg-blue-600 text-white hover:bg-blue-500 shadow-sm'}`}
                                                    >
                                                        {jdUploading ? 'Parsing...' : profileData?.hasActiveJD ? 'Replace JD' : 'Upload JD'}
                                                    </button>
                                                </div>
                                            </div>

                                            {jdError && (
                                                <div className="px-5 pb-4">
                                                    <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-[11px] text-red-500 font-medium">
                                                        <X size={12} /> {jdError}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {false && (
                                    <div className="mt-5">
                                        <div className="bg-bg-item-surface rounded-xl border border-border-subtle">
                                            <div className="p-5">
                                                <div className="flex items-center gap-4 mb-4">
                                                    <div className="w-10 h-10 rounded-lg bg-bg-input border border-border-subtle flex items-center justify-center text-emerald-500 shrink-0">
                                                        <Globe size={20} />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <h4 className="text-sm font-bold text-text-primary">Google 搜索 API</h4>
                                                            {hasStoredGoogleSearchKey && hasStoredGoogleSearchCseId && (
                                                                <span className="text-[9px] font-bold text-emerald-500 px-1.5 py-0.5 bg-emerald-500/10 rounded-full border border-emerald-500/20 uppercase tracking-wide">已连接</span>
                                                            )}
                                                        </div>
                                                        <p className="text-[11px] text-text-secondary mt-0.5">
                                                            用于公司研究时的实时网页搜索。
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="space-y-3">
                                                    <div>
                                                        <div className="flex justify-between items-center mb-1.5">
                                                            <label className="text-[10px] font-semibold text-text-secondary uppercase tracking-wide block">API 密钥</label>
                                                            {hasStoredGoogleSearchKey && (
                                                                <button
                                                                    onClick={() => handleRemoveGoogleSearchKey('apikey')}
                                                                    className="text-[10px] flex items-center gap-1 text-red-400 hover:text-red-300 transition-colors bg-red-500/10 hover:bg-red-500/20 px-1.5 py-0.5 rounded"
                                                                    title="移除 API 密钥"
                                                                >
                                                                    <Trash2 size={10} strokeWidth={2} /> 移除
                                                                </button>
                                                            )}
                                                        </div>
                                                        <input
                                                            type="password"
                                                            value={googleSearchApiKey}
                                                            onChange={(e) => setGoogleSearchApiKey(e.target.value)}
                                                            placeholder={hasStoredGoogleSearchKey ? '••••••••••••' : '输入 Google API 密钥'}
                                                            className="w-full bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent-primary/50 focus:ring-1 focus:ring-accent-primary/20 transition-all"
                                                        />
                                                    </div>
                                                    <div>
                                                        <div className="flex justify-between items-center mb-1.5">
                                                            <label className="text-[10px] font-semibold text-text-secondary uppercase tracking-wide block">自定义搜索引擎 ID</label>
                                                            {hasStoredGoogleSearchCseId && (
                                                                <button
                                                                    onClick={() => handleRemoveGoogleSearchKey('cseid')}
                                                                    className="text-[10px] flex items-center gap-1 text-red-400 hover:text-red-300 transition-colors bg-red-500/10 hover:bg-red-500/20 px-1.5 py-0.5 rounded"
                                                                    title="移除 CSE ID"
                                                                >
                                                                    <Trash2 size={10} strokeWidth={2} /> 移除
                                                                </button>
                                                            )}
                                                        </div>
                                                        <input
                                                            type="text"
                                                            value={googleSearchCseId}
                                                            onChange={(e) => setGoogleSearchCseId(e.target.value)}
                                                            placeholder={hasStoredGoogleSearchCseId ? '••••••••••••' : '输入 CSE ID（cx）'}
                                                            className="w-full bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent-primary/50 focus:ring-1 focus:ring-accent-primary/20 transition-all"
                                                        />
                                                    </div>
                                                    <button
                                                        onClick={async () => {
                                                            if (!googleSearchApiKey.trim() && !googleSearchCseId.trim()) return;
                                                            setGoogleSearchSaving(true);
                                                            try {
                                                                if (googleSearchApiKey.trim()) {
                                                                    await window.electronAPI?.setGoogleSearchApiKey?.(googleSearchApiKey.trim());
                                                                    setHasStoredGoogleSearchKey(true);
                                                                    setGoogleSearchApiKey('');
                                                                }
                                                                if (googleSearchCseId.trim()) {
                                                                    await window.electronAPI?.setGoogleSearchCseId?.(googleSearchCseId.trim());
                                                                    setHasStoredGoogleSearchCseId(true);
                                                                    setGoogleSearchCseId('');
                                                                }
                                                            } catch (e) {
                                                                console.error('Failed to save Google Search keys:', e);
                                                            } finally {
                                                                setGoogleSearchSaving(false);
                                                            }
                                                        }}
                                                        disabled={googleSearchSaving || (!googleSearchApiKey.trim() && !googleSearchCseId.trim())}
                                                        className={`w-full px-4 py-2 rounded-lg text-xs font-medium transition-all ${googleSearchSaving ? 'bg-bg-input text-text-tertiary cursor-wait' : (!googleSearchApiKey.trim() && !googleSearchCseId.trim()) ? 'bg-bg-input text-text-tertiary cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm'}`}
                                                    >
                                                        {googleSearchSaving ? '保存中...' : '保存凭据'}
                                                    </button>
                                                </div>

                                                <div className="mt-3 flex items-start gap-2 px-3 py-2.5 bg-bg-input/50 rounded-lg">
                                                    <Info size={12} className="text-text-tertiary shrink-0 mt-0.5" />
                                                    <p className="text-[10px] text-text-tertiary leading-relaxed">
                                                        如果这里不填，公司研究会退回使用 LLM 的通用知识，信息可能过时。你可以在 <span className="text-emerald-500/80 hover:text-emerald-400 underline underline-offset-2" onClick={() => window.electronAPI?.openExternal?.('https://console.cloud.google.com/apis/credentials')}>Google Cloud Console</span> 获取 API 密钥，并在 <span className="text-emerald-500/80 hover:text-emerald-400 underline underline-offset-2" onClick={() => window.electronAPI?.openExternal?.('https://cse.google.com/cse/create/new')}>cse.google.com</span> 创建自定义搜索引擎。
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    )}

                                    {/* Company Research Section */}
                                    {false && profileData?.hasActiveJD && profileData?.activeJD?.company && (
                                        <div className="mt-5">
                                            <div className="bg-bg-item-surface rounded-xl border border-border-subtle p-5">
                                                <div className="flex items-center justify-between mb-4">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 rounded-lg bg-bg-input border border-border-subtle flex items-center justify-center text-purple-500">
                                                            <Building2 size={20} />
                                                        </div>
                                                        <div>
                                                            <h4 className="text-sm font-bold text-text-primary">
                                                                公司情报：<span className="text-purple-400">{profileData.activeJD.company}</span>
                                                            </h4>
                                                            <p className="text-[11px] text-text-secondary mt-0.5">
                                                                {companyDossier ? '研究已完成' : '运行研究以获取招聘策略、薪资区间和竞争对手信息'}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <button
                                                        onClick={async () => {
                                                            setCompanyResearching(true);
                                                            try {
                                                                const result = await window.electronAPI?.profileResearchCompany?.(profileData.activeJD.company);
                                                                if (result?.success && result.dossier) {
                                                                    setCompanyDossier(result.dossier);
                                                                }
                                                            } catch (e) {
                                                                console.error('Research failed:', e);
                                                            } finally {
                                                                setCompanyResearching(false);
                                                            }
                                                        }}
                                                        disabled={companyResearching}
                                                        className={`px-4 py-2 rounded-full text-xs font-medium transition-all flex items-center gap-2 ${companyResearching ? 'bg-bg-input text-text-tertiary cursor-wait border border-border-subtle' : 'bg-purple-600/10 text-purple-500 hover:bg-purple-600/20 border border-purple-500/20'}`}
                                                    >
                                                        {companyResearching ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
                                                        {companyResearching ? '研究中...' : companyDossier ? '刷新' : '立即研究'}
                                                    </button>
                                                </div>

                                                {/* Dossier Results */}
                                                {companyDossier && (
                                                    <div className="space-y-4 border-t border-border-subtle pt-4 mt-2">
                                                        {companyDossier.hiring_strategy && (
                                                            <div>
                                                                <div className="text-[10px] font-bold text-text-primary uppercase tracking-wide mb-1">招聘策略</div>
                                                                <p className="text-xs text-text-secondary leading-relaxed bg-bg-input p-3 rounded-lg">{companyDossier.hiring_strategy}</p>
                                                            </div>
                                                        )}

                                                        {companyDossier.interview_focus && (
                                                            <div>
                                                                <div className="text-[10px] font-bold text-text-primary uppercase tracking-wide mb-1">面试重点</div>
                                                                <p className="text-xs text-text-secondary leading-relaxed bg-bg-input p-3 rounded-lg">{companyDossier.interview_focus}</p>
                                                            </div>
                                                        )}

                                                        {companyDossier.salary_estimates?.length > 0 && (
                                                            <div>
                                                                <div className="text-[10px] font-bold text-text-primary uppercase tracking-wide mb-1">薪资估算</div>
                                                                <div className="space-y-2 bg-bg-input p-3 rounded-lg">
                                                                    {companyDossier.salary_estimates.map((s: any, i: number) => (
                                                                        <div key={i} className="flex items-center justify-between pb-2 mb-2 border-b border-border-subtle last:border-0 last:pb-0 last:mb-0">
                                                                            <span className="text-xs text-text-primary font-medium">{s.title} <span className="text-text-tertiary">({s.location})</span></span>
                                                                            <div className="flex items-center gap-2">
                                                                                <span className="text-xs font-bold text-green-400">
                                                                                    {s.currency} {s.min?.toLocaleString()} - {s.max?.toLocaleString()}
                                                                                </span>
                                                                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${s.confidence === 'high' ? 'bg-green-500/10 text-green-500 border-green-500/20' : s.confidence === 'medium' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                                                                                    {s.confidence.toUpperCase()}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {companyDossier.competitors?.length > 0 && (
                                                            <div>
                                                                <div className="text-[10px] font-bold text-text-primary uppercase tracking-wide mb-2">竞争对手</div>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {companyDossier.competitors.map((c: string, i: number) => (
                                                                        <span key={i} className="text-[11px] text-text-secondary px-2.5 py-1 rounded-full bg-bg-input flex items-center gap-1.5">
                                                                            <Building2 size={10} className="text-text-tertiary" /> {c}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {companyDossier.sources?.length > 0 && (
                                                            <div className="text-[10px] text-text-tertiary mt-2">
                                                                Sources: {companyDossier.sources.filter(Boolean).length} references
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    <ProfileVisualizer profileData={profileData} />


                                </div>
                            )}
                            {activeTab === 'ai-providers' && (
                                <AIProvidersSettings />
                            )}
                            {activeTab === 'keybinds' && (
                                <div className="space-y-5 animated fadeIn select-text pb-4">
                                    <div className="flex items-start justify-between">
                                        <div>
                                                <h3 className="text-lg font-bold text-text-primary mb-1">键盘快捷键</h3>
                                                <p className="text-xs text-text-secondary">Natively 支持这些容易记住的快捷操作。</p>
                                        </div>
                                        <button
                                            onClick={resetShortcuts}
                                            className="flex items-center gap-2 px-4 py-1.5 rounded-full border border-border-subtle bg-bg-subtle/30 hover:bg-bg-subtle hover:border-green-500/30 transition-all duration-200 text-xs font-medium text-text-secondary hover:text-green-500 active:scale-95 mt-1"
                                        >
                                            <RotateCcw size={13} strokeWidth={2.5} />
                                            恢复默认
                                        </button>
                                    </div>

                                    <div className="grid gap-6">
                                        {/* General Category */}
                                        <div>
                                            <h4 className="text-sm font-bold text-text-primary mb-3">通用</h4>
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between py-1.5 group">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-text-tertiary group-hover:text-text-primary transition-colors w-5 flex justify-center"><Eye size={14} /></span>
                                                                <span className="text-sm text-text-secondary font-medium group-hover:text-text-primary transition-colors">显示/隐藏/置前</span>
                                                    </div>
                                                    <KeyRecorder
                                                        currentKeys={shortcuts.toggleVisibility}
                                                        onSave={(keys) => updateShortcut('toggleVisibility', keys)}
                                                    />
                                                </div>
                                                <div className="flex items-center justify-between py-1.5 group">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-text-tertiary group-hover:text-text-primary transition-colors w-5 flex justify-center"><MessageSquare size={14} /></span>
                                                                <span className="text-sm text-text-secondary font-medium group-hover:text-text-primary transition-colors">处理截图</span>
                                                    </div>
                                                    <KeyRecorder
                                                        currentKeys={shortcuts.processScreenshots}
                                                        onSave={(keys) => updateShortcut('processScreenshots', keys)}
                                                    />
                                                </div>
                                                <div className="flex items-center justify-between py-1.5 group">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-text-tertiary group-hover:text-text-primary transition-colors w-5 flex justify-center"><RotateCcw size={14} /></span>
                                                        <span className="text-sm text-text-secondary font-medium group-hover:text-text-primary transition-colors">重置 / 取消</span>
                                                    </div>
                                                    <KeyRecorder
                                                        currentKeys={shortcuts.resetCancel}
                                                        onSave={(keys) => updateShortcut('resetCancel', keys)}
                                                    />
                                                </div>
                                                <div className="flex items-center justify-between py-1.5 group">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-text-tertiary group-hover:text-text-primary transition-colors w-5 flex justify-center"><Camera size={14} /></span>
                                                                <span className="text-sm text-text-secondary font-medium group-hover:text-text-primary transition-colors">截图</span>
                                                    </div>
                                                    <KeyRecorder
                                                        currentKeys={shortcuts.takeScreenshot}
                                                        onSave={(keys) => updateShortcut('takeScreenshot', keys)}
                                                    />
                                                </div>
                                                <div className="flex items-center justify-between py-1.5 group">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-text-tertiary group-hover:text-text-primary transition-colors w-5 flex justify-center"><Crop size={14} /></span>
                                                                <span className="text-sm text-text-secondary font-medium group-hover:text-text-primary transition-colors">区域截图</span>
                                                    </div>
                                                    <KeyRecorder
                                                        currentKeys={shortcuts.selectiveScreenshot}
                                                        onSave={(keys) => updateShortcut('selectiveScreenshot', keys)}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Chat Category */}
                                        <div>
                                            <div className="mb-3">
                                                <h4 className="text-sm font-bold text-text-primary">聊天</h4>
                                            </div>
                                            <div className="space-y-1">
                                                {[
                                                                { id: 'whatToAnswer', label: '怎么回答', icon: <Sparkles size={14} /> },
                                                                { id: 'shorten', label: '精简', icon: <Pencil size={14} /> },
                                                    { id: 'followUp', label: 'Follow Up', icon: <MessageSquare size={14} /> },
                                                                { id: 'recap', label: '生成总结', icon: <RefreshCw size={14} /> },
                                                                { id: 'answer', label: '回答 / 录音', icon: <Mic size={14} /> },
                                                    { id: 'scrollUp', label: 'Scroll Up', icon: <ArrowUp size={14} /> },
                                                    { id: 'scrollDown', label: 'Scroll Down', icon: <ArrowDown size={14} /> },
                                                ].map((item, i) => (
                                                    <div key={i} className="flex items-center justify-between py-1.5 group">
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-text-tertiary group-hover:text-text-primary transition-colors w-5 flex justify-center">{item.icon}</span>
                                                            <span className="text-sm text-text-secondary font-medium group-hover:text-text-primary transition-colors">{item.label}</span>
                                                        </div>
                                                        <KeyRecorder
                                                            currentKeys={shortcuts[item.id as keyof typeof shortcuts]}
                                                            onSave={(keys) => updateShortcut(item.id as any, keys)}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Window Category */}
                                        <div>
                                                <h4 className="text-sm font-bold text-text-primary mb-3">窗口</h4>
                                            <div className="space-y-1">
                                                {[
                                                                { id: 'moveWindowUp', label: '窗口上移', icon: <ArrowUp size={14} /> },
                                                                { id: 'moveWindowDown', label: '窗口下移', icon: <ArrowDown size={14} /> },
                                                                { id: 'moveWindowLeft', label: '窗口左移', icon: <ArrowLeft size={14} /> },
                                                                { id: 'moveWindowRight', label: '窗口右移', icon: <ArrowRight size={14} /> }
                                                ].map((item, i) => (
                                                    <div key={i} className="flex items-center justify-between py-1.5 group">
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-text-tertiary group-hover:text-text-primary transition-colors w-5 flex justify-center">{item.icon}</span>
                                                            <span className="text-sm text-text-secondary font-medium group-hover:text-text-primary transition-colors">{item.label}</span>
                                                        </div>
                                                        <KeyRecorder
                                                            currentKeys={shortcuts[item.id as keyof typeof shortcuts]}
                                                            onSave={(keys) => updateShortcut(item.id as any, keys)}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'audio' && (
                                <div className="space-y-6 animated fadeIn">
                                    {/* ── Speech Provider Section ── */}
                                    <div>
                                            <h3 className="text-lg font-bold text-text-primary mb-1">语音提供商</h3>
                                            <p className="text-xs text-text-secondary mb-5">选择将语音转成文字所使用的引擎。</p>

                                        <div className="space-y-4">
                                            <div className="bg-bg-card rounded-xl border border-border-subtle p-4 space-y-3">
                                                    <label className="text-xs font-medium text-text-secondary block">语音提供商</label>
                                                <div className="relative">
                                                    <ProviderSelect
                                                        value={sttProvider}
                                                        onChange={(val) => handleSttProviderChange(val as any)}
                                                        options={[
                                                            { id: 'google', label: 'Google Cloud 语音识别', badge: googleServiceAccountPath ? '已保存' : null, recommended: true, desc: '通过服务账号使用 gRPC 流式识别', color: 'blue', icon: <Mic size={14} /> },
                                                            { id: 'groq', label: 'Groq Whisper', badge: hasStoredSttGroqKey ? '已保存' : null, recommended: true, desc: '超快 REST 转录', color: 'orange', icon: <Mic size={14} /> },
                                                            { id: 'openai', label: 'OpenAI Whisper', badge: hasStoredSttOpenaiKey ? '已保存' : null, desc: '兼容 OpenAI 的 Whisper API', color: 'green', icon: <Mic size={14} /> },
                                                            { id: 'deepgram', label: 'Deepgram Nova-2', badge: hasStoredDeepgramKey ? '已保存' : null, recommended: true, desc: '高精度 REST 转录', color: 'purple', icon: <Mic size={14} /> },
                                                            { id: 'elevenlabs', label: 'ElevenLabs Scribe', badge: hasStoredElevenLabsKey ? '已保存' : null, desc: 'Scribe v2 实时 API', color: 'teal', icon: <Mic size={14} /> },
                                                            { id: 'azure', label: 'Azure 语音', badge: hasStoredAzureKey ? '已保存' : null, desc: 'Microsoft Cognitive Services 语音转文字', color: 'cyan', icon: <Mic size={14} /> },
                                                            { id: 'ibmwatson', label: 'IBM Watson', badge: hasStoredIbmWatsonKey ? '已保存' : null, desc: 'IBM Watson 云端 STT 服务', color: 'indigo', icon: <Mic size={14} /> },
                                                            { id: 'soniox', label: 'Soniox', badge: hasStoredSonioxKey ? '已保存' : null, recommended: true, desc: '支持 60+ 语言、多语种与领域上下文', color: 'cyan', icon: <Mic size={14} /> },
                                                            { id: 'alibaba', label: '阿里云 Paraformer', badge: hasStoredAlibabaKey ? '已保存' : null, recommended: true, desc: 'DashScope 中文实时转写，支持热词', color: 'orange', icon: <Mic size={14} /> },
                                                        ]}
                                                    />
                                                </div>
                                            </div>

                                            {/* Groq Model Selector */}
                                            {sttProvider === 'groq' && (
                                                <div className="bg-bg-card rounded-xl border border-border-subtle p-4">
                                                    <label className="text-xs font-medium text-text-secondary mb-2.5 block">Whisper 模型</label>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {[
                                                            { id: 'whisper-large-v3-turbo', label: 'V3 Turbo', desc: '最快' },
                                                            { id: 'whisper-large-v3', label: 'V3', desc: '最准' },
                                                        ].map((m) => (
                                                            <button
                                                                key={m.id}
                                                                onClick={async () => {
                                                                    setGroqSttModel(m.id);
                                                                    try {
                                                                        // @ts-ignore
                                                                        await window.electronAPI?.setGroqSttModel?.(m.id);
                                                                    } catch (e) {
                                                                        console.error('Failed to set Groq model:', e);
                                                                    }
                                                                }}
                                                                className={`rounded-lg px-3 py-2.5 text-left transition-all duration-200 ease-in-out active:scale-[0.98] ${groqSttModel === m.id
                                                                    ? 'bg-blue-600 text-white shadow-md'
                                                                    : 'bg-bg-input hover:bg-bg-elevated text-text-primary'
                                                                    }`}
                                                            >
                                                                <span className="text-sm font-medium block">{m.label}</span>
                                                                <span className={`text-[11px] transition-colors ${groqSttModel === m.id ? 'text-white/70' : 'text-text-tertiary'
                                                                    }`}>{m.desc}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Google Cloud Service Account */}
                                            {sttProvider === 'google' && (
                                                <div className="bg-bg-card rounded-xl border border-border-subtle p-4">
                                                    <label className="text-xs font-medium text-text-secondary mb-2 block">服务账号 JSON</label>
                                                    <div className="flex gap-2">
                                                        <div className="flex-1 bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-secondary font-mono truncate">
                                                            {googleServiceAccountPath
                                                                ? <span className="text-text-primary">{googleServiceAccountPath.split('/').pop()}</span>
                                                                : <span className="text-text-tertiary italic">未选择文件</span>}
                                                        </div>
                                                        <button
                                                            onClick={async () => {
                                                                // @ts-ignore
                                                                const result = await window.electronAPI?.selectServiceAccount?.();
                                                                if (result?.success && result.path) {
                                                                    setGoogleServiceAccountPath(result.path);
                                                                }
                                                            }}
                                                            className="px-3 py-2 bg-bg-input hover:bg-bg-elevated border border-border-subtle rounded-lg text-xs font-medium text-text-primary transition-colors flex items-center gap-2"
                                                        >
                                                            <Upload size={14} /> 选择文件
                                                        </button>
                                                    </div>
                                                    <p className="text-[10px] text-text-tertiary mt-2">
                                                        使用 Google Cloud 实时识别时必填。
                                                    </p>
                                                </div>
                                            )}

                                            {/* API Key Input (non-Google providers) */}
                                            {sttProvider !== 'google' && (
                                                <div className="bg-bg-card rounded-xl border border-border-subtle p-4 space-y-3">
                                                    <label className="text-xs font-medium text-text-secondary block">
                                                        {sttProvider === 'groq' ? 'Groq' : sttProvider === 'openai' ? 'OpenAI STT' : sttProvider === 'elevenlabs' ? 'ElevenLabs' : sttProvider === 'azure' ? 'Azure' : sttProvider === 'ibmwatson' ? 'IBM Watson' : sttProvider === 'soniox' ? 'Soniox' : sttProvider === 'alibaba' ? '阿里云 Paraformer' : 'Deepgram'} API 密钥
                                                    </label>
                                                    {sttProvider === 'openai' && (
                                                        <p className="text-[10px] text-text-tertiary mb-1.5">
                                                            这个 key 与主 AI Provider 的 key 是分开的。
                                                        </p>
                                                    )}
                                                    <div className="flex gap-2">
                                                        <input
                                                            type="password"
                                                            value={
                                                                sttProvider === 'groq' ? sttGroqKey
                                                                    : sttProvider === 'openai' ? sttOpenaiKey
                                                                        : sttProvider === 'elevenlabs' ? sttElevenLabsKey
                                                                            : sttProvider === 'azure' ? sttAzureKey
                                                                                : sttProvider === 'ibmwatson' ? sttIbmKey
                                                                                    : sttProvider === 'soniox' ? sttSonioxKey
                                                                                        : sttProvider === 'alibaba' ? sttAlibabaKey
                                                                                        : sttDeepgramKey
                                                            }
                                                            onChange={(e) => {
                                                                if (sttProvider === 'groq') setSttGroqKey(e.target.value);
                                                                else if (sttProvider === 'openai') setSttOpenaiKey(e.target.value);
                                                                else if (sttProvider === 'elevenlabs') setSttElevenLabsKey(e.target.value);
                                                                else if (sttProvider === 'azure') setSttAzureKey(e.target.value);
                                                                else if (sttProvider === 'ibmwatson') setSttIbmKey(e.target.value);
                                                                else if (sttProvider === 'soniox') setSttSonioxKey(e.target.value);
                                                                else if (sttProvider === 'alibaba') setSttAlibabaKey(e.target.value);
                                                                else setSttDeepgramKey(e.target.value);
                                                            }}
                                                            placeholder={
                                                                sttProvider === 'groq'
                                                                    ? (hasStoredSttGroqKey ? '••••••••••••' : '输入 Groq API 密钥')
                                                                    : sttProvider === 'openai'
                                                                        ? (hasStoredSttOpenaiKey ? '••••••••••••' : '输入 OpenAI STT API 密钥')
                                                                        : sttProvider === 'elevenlabs'
                                                                            ? (hasStoredElevenLabsKey ? '••••••••••••' : '输入 ElevenLabs API 密钥')
                                                                            : sttProvider === 'azure'
                                                                                ? (hasStoredAzureKey ? '••••••••••••' : '输入 Azure API 密钥')
                                                                                : sttProvider === 'ibmwatson'
                                                                                    ? (hasStoredIbmWatsonKey ? '••••••••••••' : '输入 IBM Watson API 密钥')
                                                                                    : sttProvider === 'soniox'
                                                                                        ? (hasStoredSonioxKey ? '••••••••••••' : '输入 Soniox API 密钥')
                                                                                        : (hasStoredDeepgramKey ? '••••••••••••' : '输入 Deepgram API 密钥')
                                                            }
                                                            className="flex-1 bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent-primary transition-colors"
                                                        />
                                                        <button
                                                            onClick={() => {
                                                                const keyMap: Record<string, string> = {
                                                                    groq: sttGroqKey, openai: sttOpenaiKey, deepgram: sttDeepgramKey,
                                                                    elevenlabs: sttElevenLabsKey, azure: sttAzureKey, ibmwatson: sttIbmKey,
                                                                    soniox: sttSonioxKey, alibaba: sttAlibabaKey,
                                                                };
                                                                handleSttKeySubmit(sttProvider as any, keyMap[sttProvider] || '');
                                                            }}
                                                            disabled={sttSaving || !(() => {
                                                                const keyMap: Record<string, string> = {
                                                                    groq: sttGroqKey, openai: sttOpenaiKey, deepgram: sttDeepgramKey,
                                                                    elevenlabs: sttElevenLabsKey, azure: sttAzureKey, ibmwatson: sttIbmKey,
                                                                    soniox: sttSonioxKey, alibaba: sttAlibabaKey,
                                                                };
                                                                return (keyMap[sttProvider] || '').trim();
                                                            })()}
                                                            className={`px-5 py-2.5 rounded-lg text-xs font-medium transition-colors ${sttSaved
                                                                ? 'bg-green-500/20 text-green-400'
                                                                : 'bg-bg-input hover:bg-bg-input/80 border border-border-subtle text-text-primary disabled:opacity-50'
                                                                }`}
                                                        >
                                                            {sttSaving ? '保存中...' : sttSaved ? '已保存' : '保存'}
                                                        </button>
                                                        {(() => {
                                                            const hasKeyMap: Record<string, boolean> = {
                                                                groq: hasStoredSttGroqKey,
                                                                openai: hasStoredSttOpenaiKey,
                                                                deepgram: hasStoredDeepgramKey,
                                                                elevenlabs: hasStoredElevenLabsKey,
                                                                azure: hasStoredAzureKey,
                                                                ibmwatson: hasStoredIbmWatsonKey,
                                                                soniox: hasStoredSonioxKey,
                                                                alibaba: hasStoredAlibabaKey,
                                                            };
                                                            return hasKeyMap[sttProvider] ? (
                                                                <button
                                                                    onClick={() => handleRemoveSttKey(sttProvider as any)}
                                                                    className="px-2.5 py-2.5 rounded-lg text-xs font-medium text-text-tertiary hover:text-red-500 hover:bg-red-500/10 transition-all"
                                                                    title="移除 API 密钥"
                                                                >
                                                                    <Trash2 size={16} strokeWidth={1.5} />
                                                                </button>
                                                            ) : null;
                                                        })()}
                                                    </div>

                                                    {(() => {
                                                        const hasKeyMap: Record<string, boolean> = {
                                                            groq: hasStoredSttGroqKey,
                                                            openai: hasStoredSttOpenaiKey,
                                                            deepgram: hasStoredDeepgramKey,
                                                            elevenlabs: hasStoredElevenLabsKey,
                                                            azure: hasStoredAzureKey,
                                                            ibmwatson: hasStoredIbmWatsonKey,
                                                            soniox: hasStoredSonioxKey,
                                                            alibaba: hasStoredAlibabaKey,
                                                        };
                                                        const keyMap: Record<string, string> = {
                                                            groq: sttGroqKey,
                                                            openai: sttOpenaiKey,
                                                            deepgram: sttDeepgramKey,
                                                            elevenlabs: sttElevenLabsKey,
                                                            azure: sttAzureKey,
                                                            ibmwatson: sttIbmKey,
                                                            soniox: sttSonioxKey,
                                                            alibaba: sttAlibabaKey,
                                                        };
                                                        const hasStoredKey = hasKeyMap[sttProvider];
                                                        const currentInput = keyMap[sttProvider] || '';
                                                        if (!hasStoredKey || currentInput.trim()) return null;

                                                        return (
                                                            <p className="text-[11px] text-text-tertiary">
                                                                Key 已保存在本地。出于安全原因，重启后这里不会回填明文；如果要更换，直接输入新 key 再保存即可。
                                                            </p>
                                                        );
                                                    })()}

                                                    {/* Azure Region Input */}
                                                    {sttProvider === 'azure' && (
                                                        <div className="space-y-1.5">
                                                            <label className="text-xs font-medium text-text-secondary block">区域</label>
                                                            <div className="flex gap-2">
                                                                <input
                                                                    type="text"
                                                                    value={sttAzureRegion}
                                                                    onChange={(e) => setSttAzureRegion(e.target.value)}
                                                                    placeholder="例如 eastus"
                                                                    className="flex-1 bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent-primary transition-colors"
                                                                />
                                                                <button
                                                                    onClick={async () => {
                                                                        if (!sttAzureRegion.trim()) return;
                                                                        // @ts-ignore
                                                                        await window.electronAPI?.setAzureRegion?.(sttAzureRegion.trim());
                                                                        setSttSaved(true);
                                                                        setTimeout(() => setSttSaved(false), 2000);
                                                                    }}
                                                                    disabled={!sttAzureRegion.trim()}
                                                                    className="px-5 py-2.5 rounded-lg text-xs font-medium bg-bg-input hover:bg-bg-input/80 border border-border-subtle text-text-primary disabled:opacity-50 transition-colors"
                                                                >
                                                                    保存
                                                                </button>
                                                            </div>
                                                            <p className="text-[10px] text-text-tertiary">例如 eastus、westeurope、westus2</p>
                                                        </div>
                                                    )}

                                                    <div className="flex items-center gap-3">
                                                        <button
                                                            onClick={handleTestSttConnection}
                                                            disabled={sttTestStatus === 'testing'}
                                                            className="text-xs bg-bg-input hover:bg-bg-elevated text-text-primary px-3 py-1.5 rounded-md transition-colors flex items-center gap-2 disabled:opacity-50"
                                                        >
                                                            {sttTestStatus === 'testing' ? (
                                                                <><RefreshCw size={12} className="animate-spin" /> 测试中...</>
                                                            ) : sttTestStatus === 'success' ? (
                                                                <><Check size={12} className="text-green-500" /> 已连接</>
                                                            ) : (
                                                                <>测试连接</>
                                                            )}
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                const urls: Record<string, string> = {
                                                                    groq: 'https://console.groq.com/keys',
                                                                    openai: 'https://platform.openai.com/api-keys',
                                                                    deepgram: 'https://console.deepgram.com',
                                                                    elevenlabs: 'https://elevenlabs.io/app/settings/api-keys',
                                                                    azure: 'https://portal.azure.com/#create/Microsoft.CognitiveServicesSpeech',
                                                                    ibmwatson: 'https://cloud.ibm.com/catalog/services/speech-to-text',
                                                                    alibaba: 'https://bailian.console.aliyun.com/'
                                                                };
                                                                if (urls[sttProvider]) {
                                                                    // @ts-ignore
                                                                    window.electronAPI?.openExternal(urls[sttProvider]);
                                                                }
                                                            }}
                                                            className="text-xs text-text-tertiary hover:text-text-primary flex items-center gap-1 transition-colors ml-1"
                                                                    title="获取 API 密钥"
                                                        >
                                                            <ExternalLink size={12} />
                                                        </button>
                                                        {sttTestStatus === 'error' && (
                                                            <span className="text-xs text-red-400">{sttTestError}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            <div className="bg-bg-card rounded-xl border border-border-subtle p-4 space-y-3">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div>
                                                        <h4 className="text-sm font-semibold text-text-primary">热词表</h4>
                                                        <p className="text-xs text-text-secondary mt-1">
                                                            每行一个词。可选格式：<code>术语 | 权重</code>。
                                                        </p>
                                                    </div>
                                                    <button
                                                        onClick={handleSaveTechnicalGlossary}
                                                        disabled={glossarySaving}
                                                        className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${glossarySaved ? 'bg-green-500/20 text-green-400' : 'bg-bg-input hover:bg-bg-elevated border border-border-subtle text-text-primary'}`}
                                                    >
                                                        {glossarySaving ? '保存中...' : glossarySaved ? '已保存' : '保存热词表'}
                                                    </button>
                                                </div>

                                                <textarea
                                                    value={technicalGlossaryText}
                                                    onChange={(e) => setTechnicalGlossaryText(e.target.value)}
                                                    rows={8}
                                                    className="w-full bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent-primary transition-colors font-mono"
                                                    placeholder={'agent | 5\ntool calling | 5\nMCP | 5\nRAG | 5\nJava | 5\n线程池 | 5'}
                                                />

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <div className="space-y-1.5">
                                                        <label className="text-xs font-medium text-text-secondary block">阿里云工作区 ID</label>
                                                        <input
                                                            type="text"
                                                            value={alibabaWorkspaceId}
                                                            onChange={(e) => setAlibabaWorkspaceId(e.target.value)}
                                                            placeholder="可选，填写 workspace id"
                                                            className="w-full bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent-primary transition-colors"
                                                        />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <label className="text-xs font-medium text-text-secondary block">阿里云热词表 ID</label>
                                                        <input
                                                            type="text"
                                                            value={alibabaVocabularyId}
                                                            onChange={(e) => setAlibabaVocabularyId(e.target.value)}
                                                            placeholder="可选，填写 vocabulary_id"
                                                            className="w-full bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent-primary transition-colors"
                                                        />
                                                    </div>
                                                </div>

                                                <p className="text-[11px] text-text-tertiary">
                                                    OpenAI 实时转写会把这份热词表当作提示词使用。阿里云 Paraformer 和 Fun-ASR 会基于同一份热词源数据同步各自模型专属的热词表。
                                                </p>
                                                {glossarySaveMessage && (
                                                    <div className={`rounded-lg border px-3 py-2 text-xs ${glossarySaveMessage.includes('失败') || glossarySaveMessage.toLowerCase().includes('failed') || glossarySaveMessage.toLowerCase().includes('error')
                                                        ? 'border-red-500/20 bg-red-500/10 text-red-300'
                                                        : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-200'
                                                        }`}>
                                                        {glossarySaveMessage}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="bg-bg-card rounded-xl border border-border-subtle p-4 space-y-4">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div>
                                                        <h4 className="text-sm font-semibold text-text-primary">STT 对比</h4>
                                                        <p className="text-xs text-text-secondary mt-1">
                                                            在同一份会议音频上并行运行当前主模型、OpenAI 和 Fun-ASR 做对比。
                                                        </p>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => window.electronAPI?.openSttCompareWindow?.()}
                                                            className="px-4 py-2 rounded-lg text-xs font-medium bg-bg-input hover:bg-bg-elevated border border-border-subtle text-text-primary"
                                                        >
                                                            打开独立对比窗口
                                                        </button>
                                                        {(sttCompareResults?.active) ? (
                                                            <button
                                                                onClick={handleStopSttCompare}
                                                                disabled={sttCompareBusy !== 'idle'}
                                                                className="px-4 py-2 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 disabled:opacity-50"
                                                            >
                                                                {sttCompareBusy === 'stopping' ? '停止中...' : '停止对比'}
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={handleStartSttCompare}
                                                                disabled={sttCompareBusy !== 'idle'}
                                                                className="px-4 py-2 rounded-lg text-xs font-medium bg-bg-input hover:bg-bg-elevated border border-border-subtle text-text-primary disabled:opacity-50"
                                                            >
                                                                {sttCompareBusy === 'starting' ? '启动中...' : '开始对比'}
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={handleExportSttBenchmark}
                                                            disabled={sttCompareBusy !== 'idle' || !(sttCompareResults?.utterances?.length > 0)}
                                                            className="px-4 py-2 rounded-lg text-xs font-medium bg-bg-input hover:bg-bg-elevated border border-border-subtle text-text-primary disabled:opacity-50"
                                                        >
                                                            {sttCompareBusy === 'exporting' ? '导出中...' : '导出报告'}
                                                        </button>
                                                    </div>
                                                </div>

                                                {sttCompareExportMessage && (
                                                    <div className="text-[11px] text-text-secondary break-all">
                                                        {sttCompareExportMessage}
                                                    </div>
                                                )}

                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                    {(sttCompareResults?.providers || []).map((provider: any) => {
                                                        const summary = sttCompareResults?.summary?.byProvider?.[provider.id];
                                                        return (
                                                            <div key={provider.id} className="rounded-lg border border-border-subtle bg-bg-input p-3 space-y-1.5">
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <span className="text-sm font-medium text-text-primary">{provider.label}</span>
                                                                    {!provider.available && <span className="text-[10px] text-amber-400">缺少密钥</span>}
                                                                </div>
                                                                <p className="text-[11px] text-text-secondary">
                                                                    平均首包：{summary?.avgFirstPartialLatencyMs ?? '暂无'} ms
                                                                </p>
                                                                <p className="text-[11px] text-text-secondary">
                                                                    平均最终稿：{summary?.avgFinalLatencyMs ?? '暂无'} ms
                                                                </p>
                                                                <p className="text-[11px] text-text-secondary">
                                                                    热词命中：{summary?.technicalTerms?.join(', ') || '暂无'}
                                                                </p>
                                                                {!provider.available && provider.reason && (
                                                                    <p className="text-[11px] text-text-tertiary">{provider.reason}</p>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                <div className="space-y-3">
                                                    {(sttCompareResults?.utterances || []).slice(-6).reverse().map((utterance: any) => (
                                                            <div key={utterance.id} className="rounded-lg border border-border-subtle bg-bg-input p-3 space-y-2">
                                                                <div className="flex items-center justify-between gap-3">
                                                                <span className="text-xs font-semibold text-text-primary uppercase tracking-wide">{utterance.speaker === 'user' ? '候选人' : '面试官'}</span>
                                                                <span className="text-[11px] text-text-tertiary">{utterance.audioBytes} 字节</span>
                                                            </div>
                                                            {Object.values(utterance.providerResults || {}).map((provider: any) => (
                                                                <div key={provider.providerId} className="text-[12px] text-text-secondary">
                                                                    <span className="font-medium text-text-primary">{provider.label}: </span>
                                                                    <span>{provider.finalText || provider.partialText || '（暂无转写结果）'}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ))}
                                                    {(!sttCompareResults?.utterances || sttCompareResults.utterances.length === 0) && (
                                                        <div className="text-xs text-text-secondary">
                                                            还没有对比样本。先启动对比会话，并让应用接收到一些麦克风或系统音频。
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Recognition Language Family */}
                                            <CustomSelect
                                                label="语言"
                                                icon={<Globe size={14} />}
                                                value={selectedSttGroup}
                                                options={languageGroups.map(g => ({
                                                    deviceId: g,
                                                    label: g,
                                                    kind: 'audioinput' as MediaDeviceKind,
                                                    groupId: '',
                                                    toJSON: () => ({})
                                                }))}
                                                onChange={handleGroupChange}
                                                placeholder="选择语言"
                                            />

                                            {/* Variant/Accent Selector (Conditional) */}
                                            {currentGroupVariants.length > 1 && (
                                                <div className="mt-3 animated fadeIn">
                                                    <CustomSelect
                                                        label="口音 / 地区"
                                                        icon={<MapPin size={14} />}
                                                        value={recognitionLanguage}
                                                        options={currentGroupVariants}
                                                        onChange={handleLanguageChange}
                                                        placeholder="选择地区"
                                                    />
                                                </div>
                                            )}

                                            <div className="flex gap-2 items-center mt-2 px-1">
                                                <Info size={14} className="text-text-secondary shrink-0" />
                                                <p className="text-xs text-text-secondary">
                                                    选择会议中主要使用的语言。
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="h-px bg-border-subtle" />

                                    {/* ── Audio Configuration Section ── */}
                                    <div>
                                        <h3 className="text-lg font-bold text-text-primary mb-1">音频设置</h3>
                                        <p className="text-xs text-text-secondary mb-5">管理输入和输出设备。</p>

                                        <div className="space-y-4">
                                            <CustomSelect
                                                label="输入设备"
                                                icon={<Mic size={16} />}
                                                value={selectedInput}
                                                options={inputDevices}
                                                onChange={(id) => {
                                                    setSelectedInput(id);
                                                    localStorage.setItem('preferredInputDeviceId', id);
                                                }}
                                                placeholder="默认麦克风"
                                            />

                                            <div>
                                                <div className="flex justify-between text-xs text-text-secondary mb-2 px-1">
                                                    <span>输入电平</span>
                                                </div>
                                                <div className="h-1.5 bg-bg-input rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-green-500 transition-all duration-100 ease-out"
                                                        style={{ width: `${micLevel}%` }}
                                                    />
                                                </div>
                                            </div>

                                            <div className="h-px bg-border-subtle my-2" />

                                            <CustomSelect
                                                label="输出设备"
                                                icon={<Speaker size={16} />}
                                                value={selectedOutput}
                                                options={outputDevices}
                                                onChange={(id) => {
                                                    setSelectedOutput(id);
                                                    localStorage.setItem('preferredOutputDeviceId', id);
                                                }}
                                                placeholder="默认扬声器"
                                            />

                                            <div className="flex justify-end">
                                                <button
                                                    onClick={async () => {
                                                        try {
                                                            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
                                                            if (!AudioContext) {
                                                                console.error("Web Audio API not supported");
                                                                return;
                                                            }

                                                            const ctx = new AudioContext();

                                                            if (ctx.state === 'suspended') {
                                                                await ctx.resume();
                                                            }

                                                            const oscillator = ctx.createOscillator();
                                                            const gainNode = ctx.createGain();

                                                            oscillator.connect(gainNode);
                                                            gainNode.connect(ctx.destination);

                                                            oscillator.type = 'sine';
                                                            oscillator.frequency.setValueAtTime(523.25, ctx.currentTime);
                                                            gainNode.gain.setValueAtTime(0.5, ctx.currentTime);
                                                            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.0);

                                                            if (selectedOutput && (ctx as any).setSinkId) {
                                                                try {
                                                                    await (ctx as any).setSinkId(selectedOutput);
                                                                } catch (e) {
                                                                    console.warn("Error setting sink for AudioContext", e);
                                                                }
                                                            }

                                                            oscillator.start();
                                                            oscillator.stop(ctx.currentTime + 1.0);
                                                        } catch (e) {
                                                            console.error("Error playing test sound", e);
                                                        }
                                                    }}
                                                    className="text-xs bg-bg-input hover:bg-bg-elevated text-text-primary px-3 py-1.5 rounded-md transition-colors flex items-center gap-2"
                                                >
                                                    <Speaker size={12} /> Test Sound
                                                </button>
                                            </div>

                                            <div className="h-px bg-border-subtle my-2" />

                                            {/* SCK Backend Toggle */}
                                            <div className="bg-amber-500/5 rounded-xl border border-amber-500/20 p-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-start gap-3">
                                                        <div className="mt-0.5 p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
                                                            <FlaskConical size={18} />
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2 mb-0.5">
                                                                <h3 className="text-sm font-bold text-text-primary">SCK 后端</h3>
                                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-400 uppercase tracking-wide">备选</span>
                                                            </div>
                                                            <p className="text-xs text-text-secondary leading-relaxed max-w-[300px]">
                                                                启用 ScreenCaptureKit 后端。如果你遇到音频采集问题，它会是比 CoreAudio 更稳妥的替代方案。
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div
                                                        onClick={() => {
                                                            const newState = !useExperimentalSck;
                                                            setUseExperimentalSck(newState);
                                                            window.localStorage.setItem('useExperimentalSckBackend', newState ? 'true' : 'false');
                                                        }}
                                                        className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${useExperimentalSck ? 'bg-amber-500' : 'bg-bg-toggle-switch border border-border-muted'}`}
                                                    >
                                                        <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${useExperimentalSck ? 'translate-x-5' : 'translate-x-0'}`} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}


                            {activeTab === 'calendar' && (
                                <div className="space-y-6 animated fadeIn h-full">
                                    <div>
                                        <h3 className="text-lg font-bold text-text-primary mb-2">可见日历</h3>
                                        <p className="text-xs text-text-secondary mb-4">即将开始的会议会从这些日历中同步。</p>
                                    </div>

                                    <div className="bg-bg-card rounded-xl p-6 border border-border-subtle flex flex-col items-start gap-4">
                                        {calendarStatus.connected ? (
                                            <div className="w-full flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                                                        <Calendar size={20} />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-medium text-text-primary">Google 日历</h4>
                                                        <p className="text-xs text-text-secondary">当前连接账号：{calendarStatus.email || '用户'}</p>
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={async () => {
                                                        setIsCalendarsLoading(true);
                                                        try {
                                                            await window.electronAPI.calendarDisconnect();
                                                            const status = await window.electronAPI.getCalendarStatus();
                                                            setCalendarStatus(status);
                                                        } catch (e) {
                                                            console.error(e);
                                                        } finally {
                                                            setIsCalendarsLoading(false);
                                                        }
                                                    }}
                                                    disabled={isCalendarsLoading}
                                                    className="px-3 py-1.5 bg-bg-input hover:bg-bg-elevated border border-border-subtle text-text-primary rounded-md text-xs font-medium transition-colors"
                                                >
                                                    {isCalendarsLoading ? '断开中...' : '断开连接'}
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="w-full py-4">
                                                <div className="mb-4">
                                                    <Calendar size={24} className="text-text-tertiary mb-3" />
                                                    <h4 className="text-sm font-bold text-text-primary mb-1">暂无日历</h4>
                                                    <p className="text-xs text-text-secondary">连接 Google 账号后即可开始使用。</p>
                                                </div>

                                                <button
                                                    onClick={async () => {
                                                        setIsCalendarsLoading(true);
                                                        try {
                                                            const res = await window.electronAPI.calendarConnect();
                                                            if (res.success) {
                                                                const status = await window.electronAPI.getCalendarStatus();
                                                                setCalendarStatus(status);
                                                            }
                                                        } catch (e) {
                                                            console.error(e);
                                                        } finally {
                                                            setIsCalendarsLoading(false);
                                                        }
                                                    }}
                                                    disabled={isCalendarsLoading}
                                                    className="bg-[#303033] hover:bg-[#3A3A3D] text-white px-4 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-2.5"
                                                >
                                                    <svg viewBox="0 0 24 24" width="14" height="14" xmlns="http://www.w3.org/2000/svg">
                                                        <g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)">
                                                            <path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z" />
                                                            <path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z" />
                                                            <path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.734 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z" />
                                                            <path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z" />
                                                        </g>
                                                    </svg>
                                                    {isCalendarsLoading ? '连接中...' : '连接 Google'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {activeTab === 'about' && (
                                <AboutSection />
                            )}
                        </div>
                    </div>
                    </motion.div>
                </motion.div>
            )
            }
            <PremiumUpgradeModal
                isOpen={isPremiumModalOpen}
                onClose={() => setIsPremiumModalOpen(false)}
                isPremium={isPremium}
                onActivated={async () => {
                    setIsPremium(true);
                    const status = await window.electronAPI?.profileGetStatus?.();
                    if (status) setProfileStatus(status);
                }}
                onDeactivated={() => {
                    setIsPremium(false);
                    // Auto-disable profile mode in UI when license is removed
                    setProfileStatus(prev => ({ ...prev, profileMode: false }));
                }}
            />

            {/* ------------------------------------------------------------------ */}
            {/* Live Preview — mockup sits below the z-50 modal                    */}
            {/* ------------------------------------------------------------------ */}
            {/* ------------------------------------------------------------------ */}
            {/* Live Preview — mockup sits below the z-50 modal                    */}
            {/* ALWAYS MOUNTED to prevent React AnimatePresence lag spikes         */}
            {/* ------------------------------------------------------------------ */}
            <div
                id="settings-mockup-wrapper"
                className="fixed inset-0 z-[49] pointer-events-none transition-opacity duration-150"
                style={{ opacity: isPreviewingOpacity ? 1 : 0 }}
            >
                <MockupNativelyInterface opacity={overlayOpacity} />
            </div>
        </AnimatePresence >
    );
};

export default SettingsOverlay;
