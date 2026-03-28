"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AudioDevices = void 0;
let NativeModule = null;
try {
    NativeModule = require('natively-audio');
}
catch (e) {
    console.error('[AudioDevices] Failed to load native module:', e);
}
const { getInputDevices, getOutputDevices } = NativeModule || {};
class AudioDevices {
    static getInputDevices() {
        if (!getInputDevices) {
            console.warn('[AudioDevices] Native functionality not available');
            return [];
        }
        try {
            return getInputDevices();
        }
        catch (e) {
            console.error('[AudioDevices] Failed to get input devices:', e);
            return [];
        }
    }
    static getOutputDevices() {
        if (!getOutputDevices) {
            console.warn('[AudioDevices] Native functionality not available');
            return [];
        }
        try {
            return getOutputDevices();
        }
        catch (e) {
            console.error('[AudioDevices] Failed to get output devices:', e);
            return [];
        }
    }
}
exports.AudioDevices = AudioDevices;
//# sourceMappingURL=AudioDevices.js.map
