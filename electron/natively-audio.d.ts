declare module 'natively-audio' {
    export function getHardwareId(): string;
    export function verifyLicenseKey(key: string, hardwareId: string, endpoint: string): Promise<string>;
    export function verifyGumroadKey(key: string): Promise<string>;
}
