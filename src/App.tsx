import React, { useState, useEffect } from "react" // forcing refresh
import { QueryClient, QueryClientProvider } from "react-query"
import { ToastProvider, ToastViewport } from "./components/ui/toast"
import NativelyInterface from "./components/NativelyInterface"
import SettingsPopup from "./components/SettingsPopup" // Keeping for legacy/specific window support if needed
import Launcher from "./components/Launcher"
import ModelSelectorWindow from "./components/ModelSelectorWindow"
import SettingsOverlay from "./components/SettingsOverlay"
import TraceWindow from "./components/TraceWindow"
import RawTranscriptWindow from "./components/RawTranscriptWindow"
import SttCompareWindow from "./components/SttCompareWindow"
import PromptLabWindow from "./components/PromptLabWindow"
import LicenseGateScreen from "./components/LicenseGateScreen"
import StartupSequence from "./components/StartupSequence"
import { AnimatePresence, motion } from "framer-motion"
import UpdateBanner from "./components/UpdateBanner"
import { SupportToaster } from "./components/SupportToaster"
import { AlertCircle } from "lucide-react"
import {
  JDAwarenessToaster,
  ProfileFeatureToaster,
  PremiumPromoToaster,
  RemoteCampaignToaster,
  PremiumUpgradeModal,
  useAdCampaigns
} from './premium'
import { analytics } from "./lib/analytics/analytics.service"
import { ErrorBoundary } from "./components/ErrorBoundary"
import { commercialConfig } from "./config/commercial"

const queryClient = new QueryClient()

const App: React.FC = () => {
  const isSettingsWindow = new URLSearchParams(window.location.search).get('window') === 'settings';
  const isLauncherWindow = new URLSearchParams(window.location.search).get('window') === 'launcher';
  const isOverlayWindow = new URLSearchParams(window.location.search).get('window') === 'overlay';
  const isModelSelectorWindow = new URLSearchParams(window.location.search).get('window') === 'model-selector';
  const isCropperWindow = new URLSearchParams(window.location.search).get('window') === 'cropper';
  const isTraceWindow = new URLSearchParams(window.location.search).get('window') === 'trace';
  const isRawTranscriptWindow = new URLSearchParams(window.location.search).get('window') === 'raw-stt';
  const isSttCompareWindow = new URLSearchParams(window.location.search).get('window') === 'stt-compare';
  const isPromptLabWindow = new URLSearchParams(window.location.search).get('window') === 'prompt-lab';

  // Default to launcher if not specified (dev mode safety)
  const isDefault = !isSettingsWindow && !isOverlayWindow && !isModelSelectorWindow && !isCropperWindow && !isTraceWindow && !isRawTranscriptWindow && !isSttCompareWindow && !isPromptLabWindow;

  if (isCropperWindow) {
    const Cropper = React.lazy(() => import('./components/Cropper'));
    return (
      <React.Suspense fallback={<div className="w-screen h-screen bg-transparent" />}>
        <Cropper />
      </React.Suspense>
    );
  }

  // Initialize Analytics
  useEffect(() => {
    // Only init if we are in a main window context to avoid duplicate events from helper windows
    // Actually, we probably want to track app open from the main entry point.
    // Let's protect initialization to ensure single run per window.
    // The service handles single-init, but let's be thoughtful about WHICH window tracks "App Open".
    // Launcher is the main entry. Overlay is the "Assistant".

    analytics.initAnalytics();

    if (isLauncherWindow || isDefault) {
      analytics.trackAppOpen();
    }

    if (isOverlayWindow) {
      analytics.trackAssistantStart();
    }

    // Cleanup / Session End
    const handleUnload = () => {
      if (isOverlayWindow) {
        analytics.trackAssistantStop();
      }
      if (isLauncherWindow || isDefault) {
        analytics.trackAppClose();
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [isLauncherWindow, isOverlayWindow, isDefault]);

  // State
  const [showStartup, setShowStartup] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState('general');
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [isPremiumActive, setIsPremiumActive] = useState(false);
  const [licenseStatusResolved, setLicenseStatusResolved] = useState(!commercialConfig.requireLicense);

  // Overlay opacity — only meaningful when isOverlayWindow, but stored centrally
  // so it can be initialized once from localStorage and updated via IPC.
  const [overlayOpacity, setOverlayOpacity] = useState<number>(() => {
    const stored = localStorage.getItem('natively_overlay_opacity');
    return stored ? parseFloat(stored) : 0.65;
  });
  
  // Profile state for ad targeting
  const [hasProfile, setHasProfile] = useState(false);
  const [isLauncherMainView, setIsLauncherMainView] = useState(true);

  // Initialize Ads Campaign Manager
  const [appStartTime] = useState<number>(Date.now());
  const [lastMeetingEndTime, setLastMeetingEndTime] = useState<number | null>(null);
  const [isProcessingMeeting, setIsProcessingMeeting] = useState<boolean>(false);
  
  // Ollama Auto-Pull State
  const [ollamaPullStatus, setOllamaPullStatus] = useState<'idle' | 'downloading' | 'complete' | 'failed'>('idle');
  const [ollamaPullPercent, setOllamaPullPercent] = useState<number>(0);
  const [ollamaPullMessage, setOllamaPullMessage] = useState<string>('');

  // Re-index State
  const [incompatibleWarning, setIncompatibleWarning] = useState<{count: number; oldProvider: string; newProvider: string} | null>(null);
  
  async function refreshLicenseStatus(options?: { preserveActiveOnNetworkError?: boolean }) {
    if (!commercialConfig.requireLicense) {
      setIsPremiumActive(true);
      setLicenseStatusResolved(true);
      return;
    }

    try {
      const payload = await window.electronAPI?.licenseGetStatus?.();
      if (!payload) {
        setIsPremiumActive(false);
        return;
      }

      const cachedExpiryMs = payload.entitlement?.expiresAt
        ? new Date(payload.entitlement.expiresAt).getTime()
        : null;
      const shouldPreserveCurrent =
        Boolean(options?.preserveActiveOnNetworkError)
        && payload.status === 'network_error'
        && isPremiumActive
        && (cachedExpiryMs === null || Date.now() <= cachedExpiryMs);
      const nextPremiumState = shouldPreserveCurrent ? true : Boolean(payload.isPremium);

      setIsPremiumActive(nextPremiumState);

      if (!nextPremiumState && isOverlayWindow) {
        window.electronAPI?.endMeeting?.().catch(() => {});
        window.electronAPI?.setWindowMode?.('launcher').catch(() => {});
      }
    } catch {
      if (!options?.preserveActiveOnNetworkError || !isPremiumActive) {
        setIsPremiumActive(false);
      }
    } finally {
      setLicenseStatusResolved(true);
    }
  }
  
  const isAppReady = !isSettingsWindow
    && !isOverlayWindow
    && !isModelSelectorWindow
    && !showStartup
    && !isSettingsOpen
    && isLauncherMainView
    && (!commercialConfig.requireLicense || isPremiumActive);
  const { activeAd, dismissAd } = useAdCampaigns(
    isPremiumActive, 
    hasProfile, 
    isAppReady,
    appStartTime,
    lastMeetingEndTime,
    isProcessingMeeting
  );

  useEffect(() => {
    // Clean up old local storage
    localStorage.removeItem('useLegacyAudioBackend');

    // Basic status check for campaign targeting
    window.electronAPI?.profileGetStatus?.().then(s => setHasProfile(s?.hasProfile || false)).catch(() => {});
    refreshLicenseStatus().catch(() => {
      setIsPremiumActive(false);
      setLicenseStatusResolved(true);
    });

    // Listen for meeting processing completion to trigger post-meeting ads
    const removeMeetingsListener = window.electronAPI?.onMeetingsUpdated?.(() => {
      console.log("[App.tsx] Meetings updated (processing finished), starting ad delay timer");
      setIsProcessingMeeting(false);
      setLastMeetingEndTime(Date.now());
    });

    // Listen for Ollama Auto-Pull Progress
    let removeProgress: (() => void) | undefined;
    let removeComplete: (() => void) | undefined;
    if (window.electronAPI?.onOllamaPullProgress && window.electronAPI?.onOllamaPullComplete) {
      removeProgress = window.electronAPI.onOllamaPullProgress((data) => {
        setOllamaPullStatus('downloading');
        setOllamaPullPercent(data.percent || 0);
        setOllamaPullMessage(data.status || 'Downloading...');
      });

      removeComplete = window.electronAPI.onOllamaPullComplete(() => {
        setOllamaPullStatus('complete');
        setOllamaPullMessage('本地 AI 记忆已就绪');
        setOllamaPullPercent(100);
        setTimeout(() => setOllamaPullStatus('idle'), 3000);
      });
    }

    let removeWarning: (() => void) | undefined;
    if (window.electronAPI?.onIncompatibleProviderWarning) {
      removeWarning = window.electronAPI.onIncompatibleProviderWarning((data) => {
        setIncompatibleWarning(data);
      });
    }

    return () => {
      if (removeMeetingsListener) removeMeetingsListener();
      if (removeProgress) removeProgress();
      if (removeComplete) removeComplete();
      if (removeWarning) removeWarning();
    }
  }, []);

  useEffect(() => {
    if (!commercialConfig.requireLicense) {
      return;
    }

    const refresh = () => {
      refreshLicenseStatus({ preserveActiveOnNetworkError: true }).catch(() => {});
    };
    const intervalId = window.setInterval(refresh, 60 * 1000);
    const handleFocus = () => {
      refresh();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isOverlayWindow, isPremiumActive]);

  // Listen for overlay opacity changes — scoped to overlay window only
  useEffect(() => {
    if (!isOverlayWindow) return;
    const removeOpacityListener = window.electronAPI?.onOverlayOpacityChanged?.((opacity) => {
      setOverlayOpacity(opacity);
    });
    return () => {
      if (removeOpacityListener) removeOpacityListener();
    };
  }, [isOverlayWindow]);

  // Handlers
  const handleReindex = async () => {
    if (window.electronAPI?.reindexIncompatibleMeetings) {
      setIncompatibleWarning(null);
      await window.electronAPI.reindexIncompatibleMeetings();
    }
  };

  const handleStartMeeting = async () => {
    try {
      localStorage.setItem('natively_last_meeting_start', Date.now().toString());
      const inputDeviceId = localStorage.getItem('preferredInputDeviceId');
      let outputDeviceId = localStorage.getItem('preferredOutputDeviceId');
      const useExperimentalSck = localStorage.getItem('useExperimentalSckBackend') === 'true';

      // Override output device ID to force SCK if experimental mode is enabled
      // Default to CoreAudio unless experimental is enabled
      if (useExperimentalSck) {
        console.log("[App] Using ScreenCaptureKit backend (Experimental).");
        outputDeviceId = "sck";
      } else {
        console.log("[App] Using CoreAudio backend (Default).");
      }

      const result = await window.electronAPI.startMeeting({
        audio: { inputDeviceId, outputDeviceId }
      });
      if (result.success) {
        analytics.trackMeetingStarted();
        // Switch to Overlay Mode via IPC
        // The main process handles window switching, but we can reinforce it or just trust main.
        // Actually, main process startMeeting triggers nothing UI-wise unless we tell it to switch window
        // But we configured main.ts to not auto-switch?
        // Let's explicitly request mode change.
        await window.electronAPI.setWindowMode('overlay');
      } else {
        if (commercialConfig.requireLicense) {
          setShowPremiumModal(true);
        }
        console.error("Failed to start meeting:", result.error);
      }
    } catch (err) {
      console.error("Failed to start meeting:", err);
    }
  };

  const handleEndMeeting = async () => {
    console.log("[App.tsx] handleEndMeeting triggered");
    analytics.trackMeetingEnded();
    setIsProcessingMeeting(true);
    try {
      await window.electronAPI.endMeeting();
      console.log("[App.tsx] endMeeting IPC completed");
      
      const startStr = localStorage.getItem('natively_last_meeting_start');
      if (startStr) {
        const duration = Date.now() - parseInt(startStr, 10);
        const threshold = import.meta.env.DEV ? 10000 : 180000;
        if (duration >= threshold) {
          localStorage.setItem('natively_show_profile_toaster', 'true');
        }
        localStorage.removeItem('natively_last_meeting_start');
      }

      // Switch back to Native Launcher Mode
      // (Ad delay tracking moved to onMeetingsUpdated listener so ads wait for note generation to finish)
      await window.electronAPI.setWindowMode('launcher');
    } catch (err) {
      console.error("Failed to end meeting:", err);
      window.electronAPI.setWindowMode('launcher');
    }
  };

  // Render Logic
  if (isSettingsWindow) {
    return (
      <ErrorBoundary context="SettingsPopup">
        <div className="h-full min-h-0 w-full">
          <QueryClientProvider client={queryClient}>
            <ToastProvider>
              <SettingsPopup />
              <ToastViewport />
            </ToastProvider>
          </QueryClientProvider>
        </div>
      </ErrorBoundary>
    );
  }

  if (isModelSelectorWindow) {
    return (
      <ErrorBoundary context="ModelSelector">
        <div className="h-full min-h-0 w-full overflow-hidden">
          <QueryClientProvider client={queryClient}>
            <ToastProvider>
              <ModelSelectorWindow />
              <ToastViewport />
            </ToastProvider>
          </QueryClientProvider>
        </div>
      </ErrorBoundary>
    );
  }

  if (isTraceWindow) {
    return (
      <ErrorBoundary context="TraceWindow">
        <div className="h-full min-h-0 w-full overflow-hidden">
          <QueryClientProvider client={queryClient}>
            <ToastProvider>
              <TraceWindow />
              <ToastViewport />
            </ToastProvider>
          </QueryClientProvider>
        </div>
      </ErrorBoundary>
    );
  }

  if (isRawTranscriptWindow) {
    return (
      <ErrorBoundary context="RawTranscriptWindow">
        <div className="h-full min-h-0 w-full overflow-hidden">
          <QueryClientProvider client={queryClient}>
            <ToastProvider>
              <RawTranscriptWindow />
              <ToastViewport />
            </ToastProvider>
          </QueryClientProvider>
        </div>
      </ErrorBoundary>
    )
  }

  if (isSttCompareWindow) {
    return (
      <ErrorBoundary context="SttCompareWindow">
        <div className="h-full min-h-0 w-full overflow-hidden">
          <QueryClientProvider client={queryClient}>
            <ToastProvider>
              <SttCompareWindow />
              <ToastViewport />
            </ToastProvider>
          </QueryClientProvider>
        </div>
      </ErrorBoundary>
    )
  }

  if (isPromptLabWindow) {
    return (
      <ErrorBoundary context="PromptLabWindow">
        <div className="h-full min-h-0 w-full overflow-hidden">
          <QueryClientProvider client={queryClient}>
            <ToastProvider>
              <PromptLabWindow />
              <ToastViewport />
            </ToastProvider>
          </QueryClientProvider>
        </div>
      </ErrorBoundary>
    )
  }

  // --- OVERLAY WINDOW (Meeting Interface) ---
  if (isOverlayWindow) {
    return (
      <ErrorBoundary context="Overlay">
        <div className="w-full relative bg-transparent">
          <QueryClientProvider client={queryClient}>
            <ToastProvider>
              <div style={{ opacity: overlayOpacity, transition: 'opacity 75ms ease' }}>
                <NativelyInterface
                  onEndMeeting={handleEndMeeting}
                />
              </div>
              <ToastViewport />
            </ToastProvider>
          </QueryClientProvider>
        </div>
      </ErrorBoundary>
    );
  }

  // --- LAUNCHER WINDOW (Default) ---
  // Renders if window=launcher OR no param
  const shouldBlockForLicense = commercialConfig.requireLicense && licenseStatusResolved && !isPremiumActive;
  const shouldShowLicenseLoading = commercialConfig.requireLicense && !licenseStatusResolved;

  return (
    <ErrorBoundary context="Launcher">
    <div className="h-full min-h-0 w-full relative">
      <AnimatePresence>
        {showStartup ? (
          <motion.div
            key="startup"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.1, pointerEvents: "none", transition: { duration: 0.6, ease: "easeInOut" } }}
          >
            <StartupSequence onComplete={() => setShowStartup(false)} />
          </motion.div>
        ) : (
          <motion.div
            key="main"
            className="h-full w-full"
            initial={{ opacity: 0, scale: 0.98, y: 15 }} // "Linear" style entry: slightly down and scaled down
            animate={{ opacity: 1, scale: 1, y: 0 }}      // Slide up and snap to place
            transition={{
              duration: 0.8,
              ease: [0.19, 1, 0.22, 1], // Expo-out: snappy start, smooth landing
              delay: 0.1
            }}
          >
            <QueryClientProvider client={queryClient}>
              <ToastProvider>
                <div id="launcher-container" className="h-full w-full relative">
                  {shouldShowLicenseLoading ? (
                    <div className="flex h-full w-full items-center justify-center bg-[#07111f] text-slate-200">
                      <div className="rounded-[28px] border border-white/10 bg-white/[0.04] px-8 py-6 text-center shadow-[0_32px_100px_rgba(0,0,0,0.35)]">
                        <div className="text-xs uppercase tracking-[0.24em] text-emerald-200/80">License Check</div>
                        <div className="mt-3 text-2xl font-semibold text-white">Checking your activation...</div>
                        <div className="mt-2 text-sm text-slate-300">Please wait a moment.</div>
                      </div>
                    </div>
                  ) : shouldBlockForLicense ? (
                    <LicenseGateScreen
                      onActivated={() => {
                        setIsPremiumActive(true);
                        setLicenseStatusResolved(true);
                        setShowPremiumModal(false);
                        setTimeout(() => {
                          setSettingsInitialTab('general');
                          setIsSettingsOpen(true);
                        }, 300);
                      }}
                    />
                  ) : (
                    <Launcher
                      onStartMeeting={handleStartMeeting}
                      onOpenSettings={(tab = 'general') => {
                        setSettingsInitialTab(tab);
                        setIsSettingsOpen(true);
                      }}
                      onPageChange={setIsLauncherMainView}
                      ollamaPullStatus={ollamaPullStatus}
                      ollamaPullPercent={ollamaPullPercent}
                      ollamaPullMessage={ollamaPullMessage}
                    />
                  )}
                </div>
                {!shouldBlockForLicense && (
                  <SettingsOverlay
                    isOpen={isSettingsOpen}
                    onClose={() => {
                      setIsSettingsOpen(false);
                    }}
                    initialTab={settingsInitialTab}
                  />
                )}
                <ToastViewport />
              </ToastProvider>
            </QueryClientProvider>
          </motion.div>
        )}
      </AnimatePresence>


      <AnimatePresence>
        {incompatibleWarning && isDefault && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed bottom-6 right-6 z-50 pointer-events-auto"
          >
            <div className="bg-[#1A1A1A] border border-[#ff3333]/30 shadow-2xl rounded-2xl p-5 max-w-[340px] flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-[#ff3333] shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-[#E0E0E0] font-medium text-sm">提供商已切换</h3>
                  <p className="text-[#A0A0A0] text-xs mt-1 leading-relaxed">
                    有 {incompatibleWarning.count} 场会议使用了你之前的 AI 提供商（{incompatibleWarning.oldProvider}），在当前的 {incompatibleWarning.newProvider} 检索结果中暂时不会显示。
                  </p>
                </div>
              </div>
              <div className="flex gap-2 mt-1 justify-end">
                <button 
                  onClick={() => setIncompatibleWarning(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#A0A0A0] hover:text-white hover:bg-white/5 transition-colors"
                >
                  知道了
                </button>
                <button 
                  onClick={handleReindex}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#ff3333]/10 text-[#ff3333] hover:bg-[#ff3333]/20 transition-colors"
                >
                  自动重新索引
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!shouldBlockForLicense && <UpdateBanner />}
      {!shouldBlockForLicense && <SupportToaster />}
      {isLauncherMainView && !isSettingsOpen && !shouldBlockForLicense && (
        <>
          <ProfileFeatureToaster 
            isOpen={activeAd === 'profile'} 
            onDismiss={dismissAd}
            onSetupProfile={() => {
              setSettingsInitialTab('profile');
              setIsSettingsOpen(true);
            }} 
          />
          <JDAwarenessToaster 
            isOpen={activeAd === 'jd'} 
            onDismiss={dismissAd}
            onSetupJD={() => {
              setSettingsInitialTab('profile');
              setIsSettingsOpen(true);
            }} 
          />
          <PremiumPromoToaster 
            isOpen={activeAd === 'promo'} 
            onDismiss={dismissAd}
            onUpgrade={() => {
              setShowPremiumModal(true);
            }} 
          />
          
          {/* Remote Campaigns Render Logic */}
          <RemoteCampaignToaster
            isOpen={typeof activeAd === 'object' && activeAd !== null}
            campaign={typeof activeAd === 'object' && activeAd !== null ? activeAd : undefined as any}
            onDismiss={dismissAd}
          />
        </>
      )}

      <PremiumUpgradeModal
        isOpen={showPremiumModal}
        onClose={() => {
          if (commercialConfig.requireLicense && !isPremiumActive) {
            return;
          }
          setShowPremiumModal(false);
        }}
        isPremium={isPremiumActive}
        dismissible={!commercialConfig.requireLicense || isPremiumActive}
        onActivated={() => {
          setIsPremiumActive(true);
          setLicenseStatusResolved(true);
          setShowPremiumModal(false);
          // After activation, open settings to Profile Intelligence
          setTimeout(() => {
            setSettingsInitialTab('profile');
            setIsSettingsOpen(true);
          }, 300);
        }}
        onDeactivated={() => {
          setIsPremiumActive(false);
          if (commercialConfig.requireLicense) {
            setIsSettingsOpen(false);
            setShowPremiumModal(true);
          }
        }}
      />
    </div>
      </ErrorBoundary>
    )
  }

export default App
