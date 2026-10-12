import { Capacitor } from '@capacitor/core';

/** UI changes that are intentionally limited to the Android Capacitor shell. */
export const isAndroidCapacitor = Capacitor.getPlatform() === 'android';
