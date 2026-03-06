import axios from 'axios';
import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { loginDevice } from './tapo-client/index.js';
import type { TapoDeviceClient } from './tapo-client/types.js';

import type { TapoHomebridgePlatform } from './TapoHomebridgePlatform.js';

export class TapoPlatformAccessory {
  private service: Service;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tapoDevice: any | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private loginPromise: Promise<any> | null = null;

  // Debouncing state
  private pendingUpdates: {
    on?: boolean;
    brightness?: number;
    hue?: number;
    saturation?: number;
    colorTemperature?: number; // In Kelvin (2500-6500)
  } = {};
  private updateTimeout: NodeJS.Timeout | null = null;
  private readonly debounceMs = 300; // 300ms debounce

  constructor(
    private readonly platform: TapoHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'TP-Link')
      .setCharacteristic(this.platform.Characteristic.Model, accessory.context.device.deviceModel)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.deviceId);

    this.service = this.accessory.getService(this.platform.Service.Lightbulb) || this.accessory.addService(this.platform.Service.Lightbulb);

    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.alias);

    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this))
      .onGet(this.getOn.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.Brightness)
      .onSet(this.setBrightness.bind(this));
      
    this.service.getCharacteristic(this.platform.Characteristic.Hue)
      .onSet(this.setHue.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.Saturation)
      .onSet(this.setSaturation.bind(this));

    // ColorTemperature uses Mireds (micro reciprocal degrees)
    // Tapo supports 2500K-6500K which is 154-400 mireds
    this.service.getCharacteristic(this.platform.Characteristic.ColorTemperature)
      .setProps({ minValue: 154, maxValue: 400 })
      .onSet(this.setColorTemperature.bind(this));
  }

  async getTapoDevice() {
    if (this.tapoDevice) {
      return this.tapoDevice;
    }

    if (this.loginPromise) {
      return this.loginPromise;
    }

    this.loginPromise = loginDevice(this.platform.config.email as string, this.platform.config.password as string, this.accessory.context.device)
      .then(device => {
        this.tapoDevice = device;
        this.loginPromise = null;
        return device;
      })
      .catch(error => {
        this.platform.log.error('Failed to login to device:', error);
        this.loginPromise = null;
        throw error;
      });

    return this.loginPromise;
  }

  /**
   * Wraps a device operation with automatic retry on session expiration
   */
  private async withRetry<T>(operation: (device: TapoDeviceClient) => Promise<T>): Promise<T> {
    const maxRetries = 3;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const device = await this.getTapoDevice();
        return await operation(device);
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'SessionExpiredError') {
          lastError = error;
          // Only log on first retry attempt
          if (attempt === 0) {
            this.platform.log.debug('Session expired, re-authenticating...');
          }
          this.tapoDevice = undefined;
          // Continue to next retry attempt
          continue;
        }
        // Reset cached device on network connection errors (no HTTP response received)
        // so the next attempt re-discovers the device IP via ARP.
        // This handles cases where the device rebooted and received a new IP address.
        if (axios.isAxiosError(error) && !error.response) {
          this.tapoDevice = undefined;
        }
        // Non-session errors are thrown immediately
        throw error;
      }
    }

    // All retries exhausted
    this.platform.log.warn('Session recovery failed after', maxRetries, 'retries');
    throw lastError;
  }

  private scheduleUpdate() {
    // Clear existing timeout
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
    }

    // Schedule new update
    this.updateTimeout = setTimeout(() => {
      this.applyPendingUpdates();
    }, this.debounceMs);
  }

  private async applyPendingUpdates() {
    const updates = { ...this.pendingUpdates };
    this.pendingUpdates = {};
    this.updateTimeout = null;

    if (Object.keys(updates).length === 0) {
      return;
    }

    try {
      await this.withRetry(async (device) => {
        if (updates.on === false) {
          await device.turnOff();
          this.platform.log.debug('Set device Off');
          return;
        }

        if (updates.on === true) {
          await device.turnOn();
          const targetBrightness = updates.brightness ??
            this.service.getCharacteristic(this.platform.Characteristic.Brightness).value as number;
          await device.setBrightness(targetBrightness);
          this.platform.log.debug('Set device On with brightness ->', targetBrightness);
          return;
        }

        // Handle color temperature updates (takes priority over HSL if both are set)
        if (updates.colorTemperature !== undefined) {
          const targetBrightness = updates.brightness ??
            this.service.getCharacteristic(this.platform.Characteristic.Brightness).value as number;

          await device.setColorTemperature(updates.colorTemperature, targetBrightness);
          this.platform.log.debug('Set color temperature ->', { colorTemp: updates.colorTemperature, brightness: targetBrightness });
          return;
        }

        // Handle brightness-only updates (no color change)
        if (updates.brightness !== undefined && updates.hue === undefined && updates.saturation === undefined) {
          await device.setBrightness(updates.brightness);
          this.platform.log.debug('Set brightness ->', updates.brightness);
          return;
        }

        // Handle HSL color updates (with optional brightness)
        if (updates.hue !== undefined || updates.saturation !== undefined) {
          const hue = updates.hue ?? this.service.getCharacteristic(this.platform.Characteristic.Hue).value as number;
          const saturation = updates.saturation ?? this.service.getCharacteristic(this.platform.Characteristic.Saturation).value as number;
          const targetBrightness = updates.brightness ??
            this.service.getCharacteristic(this.platform.Characteristic.Brightness).value as number;

          await device.setHSL(hue, saturation, targetBrightness);
          this.platform.log.debug('Set HSL ->', { hue, saturation, brightness: targetBrightness });
        }
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'SessionExpiredError') {
        this.platform.log.debug('Update failed due to session issue:', error.message);
      } else {
        this.platform.log.error('Failed to apply pending updates:', error);
      }
    }
  }

  async setOn(value: CharacteristicValue) {
    this.pendingUpdates.on = value as boolean;
    this.scheduleUpdate();
  }

  async getOn(): Promise<CharacteristicValue> {
    try {
      return await this.withRetry(async (device) => {
        const deviceInfo = await device.getDeviceInfo();
        const isOn = deviceInfo.device_on;
        this.platform.log.debug('Get Characteristic On ->', isOn);
        return isOn;
      });
    } catch (error) {
      this.platform.log.error('Failed to get On characteristic:', error);
      return false;
    }
  }

  async setBrightness(value: CharacteristicValue) {
    const brightnessLevel = typeof value === 'number' ? Math.max(0, Math.min(100, value)) : 100;
    this.pendingUpdates.brightness = brightnessLevel;
    this.scheduleUpdate();
  }

  async setHue(value: CharacteristicValue) {
    this.pendingUpdates.hue = value as number;
    this.scheduleUpdate();
  }

  async setSaturation(value: CharacteristicValue) {
    this.pendingUpdates.saturation = value as number;
    this.scheduleUpdate();
  }

  async setColorTemperature(value: CharacteristicValue) {
    // Convert mireds to Kelvin: K = 1,000,000 / mireds
    const mireds = value as number;
    const kelvin = Math.round(1000000 / mireds);
    // Clamp to Tapo's supported range (2500K-6500K)
    const clampedKelvin = Math.max(2500, Math.min(6500, kelvin));
    this.pendingUpdates.colorTemperature = clampedKelvin;
    this.scheduleUpdate();
  }
}
