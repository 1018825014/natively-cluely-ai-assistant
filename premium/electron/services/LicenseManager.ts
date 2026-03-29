import Store from 'electron-store';
import axios from 'axios';
import { getCommercialConfig } from '../../../electron/services/CommercialConfig';

type LicenseStatusValue =
  | 'inactive'
  | 'valid'
  | 'expired'
  | 'revoked'
  | 'activation_limit_hit'
  | 'offline_grace'
  | 'invalid_license'
  | 'network_error';

interface LicenseEntitlement {
  licenseKey: string;
  sku: string;
  status: Exclude<LicenseStatusValue, 'inactive' | 'network_error' | 'invalid_license'>;
  expiresAt: string | null;
  activationLimit: number;
  orderId: string;
  buyerId: string;
  hardwareId: string;
  lastValidatedAt: string;
  offlineGraceEndsAt: string | null;
  signature: string;
}

interface LicenseSummary {
  licenseKey: string;
  sku: string;
  durationDays: number | null;
  expiresAt: string | null;
  activationLimit: number;
  status: LicenseStatusValue;
  orderId: string;
  buyerId: string;
}

interface LicenseStatusResponse {
  success: boolean;
  status: LicenseStatusValue;
  isPremium: boolean;
  error?: string;
  entitlement?: LicenseEntitlement | null;
  license?: LicenseSummary | null;
}

interface ActivationResponse {
  success: boolean;
  status: LicenseStatusValue;
  error?: string;
  entitlement?: LicenseEntitlement | null;
  license?: LicenseSummary | null;
}

interface LicenseStoreShape {
  licenseKey: string | null;
  entitlement: LicenseEntitlement | null;
  license: LicenseSummary | null;
}

type NativeLicenseBinding = {
  getHardwareId: () => string;
  verifyLicenseKey?: (licenseKey: string, hardwareId: string, endpoint: string) => Promise<string | object>;
  verifyGumroadKey?: (licenseKey: string) => Promise<string | object>;
};

const nativeBinding = require('natively-audio') as NativeLicenseBinding;

function parsePayload<T>(payload: string | object | null | undefined): T {
  if (!payload) {
    throw new Error('Empty payload');
  }

  return typeof payload === 'string' ? JSON.parse(payload) as T : payload as T;
}

function isEntitlementWithinOfflineGrace(entitlement: LicenseEntitlement | null): boolean {
  if (!entitlement?.offlineGraceEndsAt) {
    return false;
  }

  return Date.now() <= new Date(entitlement.offlineGraceEndsAt).getTime();
}

function isEntitlementExpired(entitlement: LicenseEntitlement | null): boolean {
  if (!entitlement?.expiresAt) {
    return false;
  }

  return Date.now() > new Date(entitlement.expiresAt).getTime();
}

export class LicenseManager {
  private static instance: LicenseManager;
  private readonly store: Store<LicenseStoreShape>;
  private readonly refreshIntervalMs = 10 * 60 * 1000;

  private constructor() {
    this.store = new Store<LicenseStoreShape>({
      name: 'natively-license-secure',
      defaults: {
        licenseKey: null,
        entitlement: null,
        license: null,
      },
      encryptionKey: 'natively-commercial-license-store',
    });
  }

  public static getInstance(): LicenseManager {
    if (!LicenseManager.instance) {
      LicenseManager.instance = new LicenseManager();
    }

    return LicenseManager.instance;
  }

  public getHardwareId(): string {
    return nativeBinding.getHardwareId();
  }

  public async activateLicense(licenseKey: string): Promise<ActivationResponse> {
    const normalizedKey = licenseKey.trim().toUpperCase();
    if (!normalizedKey) {
      return {
        success: false,
        status: 'invalid_license',
        error: '请输入授权码。',
        entitlement: null,
        license: null,
      };
    }

    try {
      const hardwareId = this.getHardwareId();
      const endpoint = `${getCommercialConfig().licenseApiBaseUrl}/licenses/activate`;
      const payload = await this.invokeVerifier(normalizedKey, hardwareId, endpoint);

      if (!payload.success || !payload.entitlement) {
        return {
          success: false,
          status: payload.status || 'invalid_license',
          error: payload.error || '许可证激活失败。',
          entitlement: payload.entitlement || null,
          license: payload.license || null,
        };
      }

      this.store.set('licenseKey', normalizedKey);
      this.store.set('entitlement', payload.entitlement);
      this.store.set('license', payload.license || null);
      return payload;
    } catch (error) {
      console.error('[LicenseManager] activateLicense failed:', error);
      return {
        success: false,
        status: 'network_error',
        error: '无法连接许可证服务，请稍后重试。',
        entitlement: null,
        license: null,
      };
    }
  }

  public async isPremium(): Promise<boolean> {
    const status = await this.getLicenseStatus();
    return status.isPremium;
  }

  public async getLicenseStatus(forceRefresh = false): Promise<LicenseStatusResponse> {
    const licenseKey = this.store.get('licenseKey');
    const entitlement = this.store.get('entitlement');
    const cachedLicense = this.store.get('license');

    if (!licenseKey) {
      return {
        success: true,
        status: 'inactive',
        isPremium: false,
        entitlement: null,
        license: null,
      };
    }

    const shouldRefresh = forceRefresh || !entitlement || this.needsRefresh(entitlement);
    if (!shouldRefresh) {
      return {
        success: true,
        status: entitlement.status,
        isPremium: entitlement.status === 'valid' || entitlement.status === 'offline_grace',
        entitlement,
        license: cachedLicense,
      };
    }

    try {
      const response = await axios.get<LicenseStatusResponse>(
        `${getCommercialConfig().licenseApiBaseUrl}/licenses/status`,
        {
          params: {
            license_key: licenseKey,
            hardware_id: this.getHardwareId(),
          },
          timeout: 15000,
        },
      );
      const payload = response.data;

      if (payload.entitlement) {
        this.store.set('entitlement', payload.entitlement);
      }
      if (payload.license) {
        this.store.set('license', payload.license);
      }

      return payload;
    } catch (error) {
      console.warn('[LicenseManager] Falling back to cached entitlement due to network error:', error);

      if (entitlement && !isEntitlementExpired(entitlement) && isEntitlementWithinOfflineGrace(entitlement)) {
        const offlinePayload: LicenseStatusResponse = {
          success: true,
          status: 'offline_grace',
          isPremium: true,
          entitlement: {
            ...entitlement,
            status: 'offline_grace',
          },
          license: cachedLicense,
        };
        this.store.set('entitlement', offlinePayload.entitlement);
        return offlinePayload;
      }

      return {
        success: false,
        status: 'network_error',
        isPremium: false,
        error: '无法连接许可证服务。',
        entitlement,
        license: cachedLicense,
      };
    }
  }

  public async deactivate(): Promise<void> {
    const licenseKey = this.store.get('licenseKey');
    if (licenseKey) {
      try {
        await axios.post(
          `${getCommercialConfig().licenseApiBaseUrl}/licenses/deactivate`,
          {
            license_key: licenseKey,
            hardware_id: this.getHardwareId(),
          },
          {
            timeout: 10000,
          },
        );
      } catch (error) {
        console.warn('[LicenseManager] deactivate request failed:', error);
      }
    }

    this.store.set('licenseKey', null);
    this.store.set('entitlement', null);
    this.store.set('license', null);
  }

  private async invokeVerifier(
    licenseKey: string,
    hardwareId: string,
    endpoint: string,
  ): Promise<ActivationResponse> {
    if (nativeBinding.verifyLicenseKey) {
      const raw = await nativeBinding.verifyLicenseKey(licenseKey, hardwareId, endpoint);
      return parsePayload<ActivationResponse>(raw);
    }

    if (nativeBinding.verifyGumroadKey) {
      const raw = await nativeBinding.verifyGumroadKey(licenseKey);
      return parsePayload<ActivationResponse>(raw);
    }

    const response = await axios.post<ActivationResponse>(
      endpoint,
      {
        license_key: licenseKey,
        hardware_id: hardwareId,
      },
      {
        timeout: 15000,
      },
    );
    return response.data;
  }

  private needsRefresh(entitlement: LicenseEntitlement): boolean {
    if (!entitlement.lastValidatedAt) {
      return true;
    }

    return Date.now() - new Date(entitlement.lastValidatedAt).getTime() > this.refreshIntervalMs;
  }
}
