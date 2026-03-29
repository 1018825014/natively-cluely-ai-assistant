import { EventEmitter } from 'events';
import axios from 'axios';
import { app } from 'electron';

import { LLMHelper } from '../../../electron/LLMHelper';
import { CredentialsManager } from '../../../electron/services/CredentialsManager';
import { getCommercialConfig } from '../../../electron/services/CommercialConfig';
import { LicenseManager } from './LicenseManager';

type HostedUsageSummary = {
  llm_requests_remaining: number;
  vision_requests_remaining: number;
  stt_minutes_remaining: number;
  reset_at: string;
  service_expires_at: string;
};

type HostedSessionExchangeResponse = {
  success: boolean;
  session_token?: string;
  expires_at?: string;
  usage?: HostedUsageSummary;
  hosted?: {
    enabled: boolean;
    byok_hidden: boolean;
    openai_compatible: {
      base_url: string;
      preferred_model: string;
      fast_model: string;
      vision_model: string;
    };
    stt?: {
      provider: 'alibaba';
      ws_url: string;
      token_ttl_seconds: number;
    };
  };
  error?: string;
};

type HostedSessionState = {
  sessionToken: string;
  expiresAt: string;
  usage?: HostedUsageSummary;
  hosted: NonNullable<HostedSessionExchangeResponse['hosted']>;
};

export type HostedAlibabaSttLease = {
  token: string;
  expiresAt: string;
  leaseMinutes: number;
};

export class HostedSessionManager extends EventEmitter {
  private static instance: HostedSessionManager;
  private llmHelper: LLMHelper | null = null;
  private sessionState: HostedSessionState | null = null;
  private sessionRefreshTimer: NodeJS.Timeout | null = null;
  private sttRefreshTimer: NodeJS.Timeout | null = null;
  private sttLease: HostedAlibabaSttLease | null = null;
  private isRefreshingSession = false;
  private isRefreshingStt = false;

  public static getInstance(): HostedSessionManager {
    if (!HostedSessionManager.instance) {
      HostedSessionManager.instance = new HostedSessionManager();
    }
    return HostedSessionManager.instance;
  }

  public attachLLMHelper(helper: LLMHelper): void {
    this.llmHelper = helper;
  }

  public isHostedEnabled(): boolean {
    return getCommercialConfig().hostedEnabled;
  }

  public getSessionState(): HostedSessionState | null {
    return this.sessionState ? { ...this.sessionState } : null;
  }

  public async refreshFromLicense(force = false): Promise<HostedSessionState | null> {
    if (!this.isHostedEnabled()) {
      this.clearSession();
      return null;
    }

    if (this.isRefreshingSession) {
      return this.sessionState;
    }

    this.isRefreshingSession = true;
    try {
      const licenseManager = LicenseManager.getInstance();
      const licenseStatus = await licenseManager.getLicenseStatus(force);
      const licenseKey = licenseStatus.license?.licenseKey;
      if (!licenseStatus.isPremium || !licenseKey) {
        this.clearSession();
        return null;
      }

      const response = await axios.post<HostedSessionExchangeResponse>(
        `${getCommercialConfig().licenseApiBaseUrl}/app/session/exchange`,
        {
          license_key: licenseKey,
          hardware_id: licenseManager.getHardwareId(),
          app_version: app.getVersion(),
          platform: process.platform,
        },
        { timeout: 15000 }
      );

      const payload = response.data;
      if (!payload.success || !payload.session_token || !payload.expires_at || !payload.hosted?.enabled) {
        this.clearSession();
        return null;
      }

      this.sessionState = {
        sessionToken: payload.session_token,
        expiresAt: payload.expires_at,
        usage: payload.usage,
        hosted: payload.hosted,
      };

      this.applyHostedLlmConfig();
      this.scheduleSessionRefresh();
      this.emit('session-updated', this.getSessionState());
      return this.getSessionState();
    } catch (error) {
      console.warn('[HostedSessionManager] Failed to refresh hosted session:', error);
      return this.sessionState;
    } finally {
      this.isRefreshingSession = false;
    }
  }

  public async ensureSession(force = false): Promise<HostedSessionState | null> {
    if (!this.sessionState) {
      return this.refreshFromLicense(force);
    }

    const expiresAtMs = new Date(this.sessionState.expiresAt).getTime();
    if (force || !Number.isFinite(expiresAtMs) || expiresAtMs - Date.now() <= 5 * 60 * 1000) {
      return this.refreshFromLicense(true);
    }

    return this.getSessionState();
  }

  public async fetchUsage(forceSessionRefresh = false): Promise<HostedUsageSummary | null> {
    const session = await this.ensureSession(forceSessionRefresh);
    if (!session) {
      return null;
    }

    try {
      const response = await axios.get<{ success: boolean; usage?: HostedUsageSummary }>(
        `${getCommercialConfig().licenseApiBaseUrl}/app/usage`,
        {
          timeout: 10000,
          headers: { Authorization: `Bearer ${session.sessionToken}` },
        }
      );
      if (response.data.success && response.data.usage) {
        this.sessionState = this.sessionState ? { ...this.sessionState, usage: response.data.usage } : this.sessionState;
        return response.data.usage;
      }
    } catch (error) {
      console.warn('[HostedSessionManager] Failed to fetch hosted usage:', error);
    }

    return this.sessionState?.usage || null;
  }

  public async prepareForMeeting(): Promise<HostedAlibabaSttLease | null> {
    const session = await this.ensureSession();
    if (!session?.hosted.stt || session.hosted.stt.provider !== 'alibaba') {
      return null;
    }

    return this.refreshAlibabaSttLease(true);
  }

  public getCachedAlibabaSttToken(): string | null {
    if (!this.sttLease) {
      return null;
    }

    if (new Date(this.sttLease.expiresAt).getTime() <= Date.now()) {
      return null;
    }

    return this.sttLease.token;
  }

  public async refreshAlibabaSttLease(force = false): Promise<HostedAlibabaSttLease | null> {
    const session = await this.ensureSession();
    if (!session?.hosted.stt) {
      this.clearAlibabaSttLease();
      return null;
    }

    if (!force && this.sttLease) {
      const expiresAtMs = new Date(this.sttLease.expiresAt).getTime();
      if (Number.isFinite(expiresAtMs) && expiresAtMs - Date.now() > 90 * 1000) {
        return { ...this.sttLease };
      }
    }

    if (this.isRefreshingStt) {
      return this.sttLease ? { ...this.sttLease } : null;
    }

    this.isRefreshingStt = true;
    try {
      const response = await axios.post<{
        success: boolean;
        token?: string;
        expires_at?: string;
        lease_minutes?: number;
        usage?: HostedUsageSummary;
      }>(
        `${getCommercialConfig().licenseApiBaseUrl}/stt/alibaba/session`,
        {
          expire_in_seconds: session.hosted.stt.token_ttl_seconds,
          issued_for: 'meeting-realtime',
        },
        {
          timeout: 15000,
          headers: { Authorization: `Bearer ${session.sessionToken}` },
        }
      );

      if (!response.data.success || !response.data.token || !response.data.expires_at) {
        return this.sttLease ? { ...this.sttLease } : null;
      }

      this.sttLease = {
        token: response.data.token,
        expiresAt: response.data.expires_at,
        leaseMinutes: response.data.lease_minutes || 1,
      };

      if (response.data.usage && this.sessionState) {
        this.sessionState = { ...this.sessionState, usage: response.data.usage };
      }

      this.scheduleSttRefresh();
      this.emit('alibaba-stt-token', { ...this.sttLease });
      return { ...this.sttLease };
    } catch (error) {
      console.warn('[HostedSessionManager] Failed to refresh Alibaba STT lease:', error);
      return this.sttLease ? { ...this.sttLease } : null;
    } finally {
      this.isRefreshingStt = false;
    }
  }

  public clearAlibabaSttLease(): void {
    if (this.sttRefreshTimer) {
      clearTimeout(this.sttRefreshTimer);
      this.sttRefreshTimer = null;
    }
    this.sttLease = null;
  }

  public clearSession(): void {
    if (this.sessionRefreshTimer) {
      clearTimeout(this.sessionRefreshTimer);
      this.sessionRefreshTimer = null;
    }
    this.clearAlibabaSttLease();
    this.sessionState = null;
    this.restoreLocalOpenAiConfig();
    this.emit('session-cleared');
  }

  private applyHostedLlmConfig(): void {
    if (!this.llmHelper || !this.sessionState) {
      return;
    }

    this.llmHelper.setOpenAICompatibleProviderConfig('openai', {
      apiKey: this.sessionState.sessionToken,
      baseUrl: this.sessionState.hosted.openai_compatible.base_url,
      preferredModel: this.sessionState.hosted.openai_compatible.preferred_model,
      fastModel: this.sessionState.hosted.openai_compatible.fast_model,
    });

    if (this.shouldSwitchToHostedDefault()) {
      const credentialsManager = CredentialsManager.getInstance();
      const customProviders = credentialsManager.getCustomProviders();
      const curlProviders = credentialsManager.getCurlProviders();
      this.llmHelper.setModel(this.sessionState.hosted.openai_compatible.preferred_model, [...customProviders, ...curlProviders]);
    }
  }

  private restoreLocalOpenAiConfig(): void {
    if (!this.llmHelper) {
      return;
    }

    const credentialsManager = CredentialsManager.getInstance();
    this.llmHelper.setOpenAICompatibleProviderConfig('openai', credentialsManager.getOpenAICompatibleProviderConfig('openai'));
  }

  private shouldSwitchToHostedDefault(): boolean {
    const credentialsManager = CredentialsManager.getInstance();
    return !credentialsManager.getGeminiApiKey()
      && !credentialsManager.getGroqApiKey()
      && !credentialsManager.getOpenaiApiKey()
      && !credentialsManager.getClaudeApiKey()
      && !credentialsManager.getAlibabaLlmApiKey();
  }

  private scheduleSessionRefresh(): void {
    if (!this.sessionState) {
      return;
    }

    if (this.sessionRefreshTimer) {
      clearTimeout(this.sessionRefreshTimer);
    }

    const expiresAtMs = new Date(this.sessionState.expiresAt).getTime();
    const delay = Math.max(60_000, expiresAtMs - Date.now() - 5 * 60 * 1000);
    this.sessionRefreshTimer = setTimeout(() => {
      void this.refreshFromLicense(true);
    }, delay);
  }

  private scheduleSttRefresh(): void {
    if (!this.sttLease) {
      return;
    }

    if (this.sttRefreshTimer) {
      clearTimeout(this.sttRefreshTimer);
    }

    const expiresAtMs = new Date(this.sttLease.expiresAt).getTime();
    const delay = Math.max(10_000, expiresAtMs - Date.now() - 60_000);
    this.sttRefreshTimer = setTimeout(() => {
      void this.refreshAlibabaSttLease(true);
    }, delay);
  }
}
