import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { loginDevice } from './tapo-client/index.js';

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
      const device = await this.getTapoDevice();

      // Handle on/off state first if present
      if (updates.on !== undefined) {
        if (updates.on) {
          await device.turnOn();
          this.platform.log.debug('Set device On');
        } else {
          await device.turnOff();
          this.platform.log.debug('Set device Off');
          return; // If turning off, skip other updates
        }
      }

      // Handle color/brightness updates together
      if (updates.hue !== undefined || updates.saturation !== undefined || updates.brightness !== undefined) {
        const hue = updates.hue ?? this.service.getCharacteristic(this.platform.Characteristic.Hue).value as number;
        const saturation = updates.saturation ?? this.service.getCharacteristic(this.platform.Characteristic.Saturation).value as number;
        const brightness = updates.brightness ?? this.service.getCharacteristic(this.platform.Characteristic.Brightness).value as number;

        await device.setHSL(hue, saturation, brightness);
        this.platform.log.debug('Set HSL ->', { hue, saturation, brightness });
      }
    } catch (error) {
      this.platform.log.error('Failed to apply pending updates:', error);
    }
  }

  async setOn(value: CharacteristicValue) {
    this.pendingUpdates.on = value as boolean;
    this.scheduleUpdate();
  }

  async getOn(): Promise<CharacteristicValue> {
    try {
      const device = await this.getTapoDevice();
      const deviceInfo = await device.getDeviceInfo();
      const isOn = deviceInfo.device_on;
      this.platform.log.debug('Get Characteristic On ->', isOn);
      return isOn;
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
}
