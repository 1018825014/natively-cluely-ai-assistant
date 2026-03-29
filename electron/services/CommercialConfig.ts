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
    websiteUrl: process.env.NATIVELY_WEBSITE_URL,
    downloadUrl: process.env.NATIVELY_DOWNLOAD_URL,
    downloadWindowsUrl: process.env.NATIVELY_WINDOWS_DOWNLOAD_URL,
    downloadMacUrl: process.env.NATIVELY_MAC_DOWNLOAD_URL,
    purchasePageUrl: process.env.NATIVELY_PURCHASE_PAGE_URL,
    activationHelpUrl: process.env.NATIVELY_ACTIVATION_HELP_URL,
    purchaseUrl: process.env.NATIVELY_PURCHASE_URL,
    supportEmail: process.env.NATIVELY_SUPPORT_EMAIL,
    supportUrl: process.env.NATIVELY_SUPPORT_URL,
    issuesUrl: process.env.NATIVELY_ISSUES_URL,
    communityUrl: process.env.NATIVELY_COMMUNITY_URL,
    donationUrl: process.env.NATIVELY_DONATION_URL,
    privacyUrl: process.env.NATIVELY_PRIVACY_URL,
    refundUrl: process.env.NATIVELY_REFUND_URL,
    eulaUrl: process.env.NATIVELY_EULA_URL,
    licenseApiBaseUrl: process.env.NATIVELY_LICENSE_API_URL,
    updateFeedUrl: process.env.NATIVELY_UPDATE_FEED_URL,
    hostedGatewayBaseUrl: process.env.NATIVELY_HOSTED_GATEWAY_URL,
};

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
    if (typeof value !== 'string' || !value.trim()) {
        return fallback;
    }

    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function trimTrailingSlash(url: string): string {
    return url.endsWith('/') ? url.slice(0, -1) : url;
}

export function getCommercialConfig(): CommercialConfig {
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
    resolved.updateFeedUrl = resolved.updateFeedUrl.trim();
    resolved.requireLicense = parseBooleanEnv(process.env.NATIVELY_REQUIRE_LICENSE, resolved.requireLicense);
    resolved.hostedEnabled = parseBooleanEnv(process.env.NATIVELY_HOSTED_ENABLED, resolved.hostedEnabled);
    resolved.hideByok = parseBooleanEnv(process.env.NATIVELY_HIDE_BYOK, resolved.hideByok);

    if (!resolved.supportUrl && resolved.supportEmail) {
        resolved.supportUrl = `mailto:${resolved.supportEmail}`;
    }

    return resolved;
}
