import baseConfig from '../../commercial.config.json';

export interface CommercialConfig {
  appName: string;
  siteName: string;
  tagline: string;
  websiteUrl: string;
  downloadUrl: string;
  downloadWindowsUrl: string;
  downloadMacUrl: string;
  purchasePageUrl: string;
  activationHelpUrl: string;
  purchaseUrl: string;
  supportEmail: string;
  supportUrl: string;
  issuesUrl: string;
  communityUrl: string;
  donationUrl: string;
  privacyUrl: string;
  refundUrl: string;
  eulaUrl: string;
  licenseApiBaseUrl: string;
  updateFeedUrl: string;
  hostedGatewayBaseUrl: string;
  requireLicense: boolean;
  hostedEnabled: boolean;
  hideByok: boolean;
}

const envOverrides: Partial<CommercialConfig> = {
  websiteUrl: import.meta.env.VITE_NATIVELY_WEBSITE_URL,
  downloadUrl: import.meta.env.VITE_NATIVELY_DOWNLOAD_URL,
  downloadWindowsUrl: import.meta.env.VITE_NATIVELY_WINDOWS_DOWNLOAD_URL,
  downloadMacUrl: import.meta.env.VITE_NATIVELY_MAC_DOWNLOAD_URL,
  purchasePageUrl: import.meta.env.VITE_NATIVELY_PURCHASE_PAGE_URL,
  activationHelpUrl: import.meta.env.VITE_NATIVELY_ACTIVATION_HELP_URL,
  purchaseUrl: import.meta.env.VITE_NATIVELY_PURCHASE_URL,
  supportEmail: import.meta.env.VITE_NATIVELY_SUPPORT_EMAIL,
  supportUrl: import.meta.env.VITE_NATIVELY_SUPPORT_URL,
  issuesUrl: import.meta.env.VITE_NATIVELY_ISSUES_URL,
  communityUrl: import.meta.env.VITE_NATIVELY_COMMUNITY_URL,
  donationUrl: import.meta.env.VITE_NATIVELY_DONATION_URL,
  privacyUrl: import.meta.env.VITE_NATIVELY_PRIVACY_URL,
  refundUrl: import.meta.env.VITE_NATIVELY_REFUND_URL,
  eulaUrl: import.meta.env.VITE_NATIVELY_EULA_URL,
  licenseApiBaseUrl: import.meta.env.VITE_NATIVELY_LICENSE_API_URL,
  updateFeedUrl: import.meta.env.VITE_NATIVELY_UPDATE_FEED_URL,
  hostedGatewayBaseUrl: import.meta.env.VITE_NATIVELY_HOSTED_GATEWAY_URL,
};

function trimTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (typeof value !== 'string' || !value.trim()) {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

export const commercialConfig: CommercialConfig = (() => {
  const resolved = {
    ...baseConfig,
    ...Object.fromEntries(
      Object.entries(envOverrides).filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
    ),
  } as CommercialConfig;

  resolved.websiteUrl = trimTrailingSlash(resolved.websiteUrl);
  resolved.downloadUrl = trimTrailingSlash(resolved.downloadUrl);
  resolved.downloadWindowsUrl = trimTrailingSlash(resolved.downloadWindowsUrl);
  resolved.downloadMacUrl = trimTrailingSlash(resolved.downloadMacUrl);
  resolved.purchasePageUrl = trimTrailingSlash(resolved.purchasePageUrl);
  resolved.activationHelpUrl = trimTrailingSlash(resolved.activationHelpUrl);
  resolved.licenseApiBaseUrl = trimTrailingSlash(resolved.licenseApiBaseUrl);
  resolved.hostedGatewayBaseUrl = trimTrailingSlash(resolved.hostedGatewayBaseUrl || resolved.licenseApiBaseUrl);
  resolved.requireLicense = parseBooleanEnv(import.meta.env.VITE_NATIVELY_REQUIRE_LICENSE, resolved.requireLicense);
  resolved.hostedEnabled = parseBooleanEnv(import.meta.env.VITE_NATIVELY_HOSTED_ENABLED, resolved.hostedEnabled);
  resolved.hideByok = parseBooleanEnv(import.meta.env.VITE_NATIVELY_HIDE_BYOK, resolved.hideByok);

  if (!resolved.supportUrl && resolved.supportEmail) {
    resolved.supportUrl = `mailto:${resolved.supportEmail}`;
  }

  return resolved;
})();
