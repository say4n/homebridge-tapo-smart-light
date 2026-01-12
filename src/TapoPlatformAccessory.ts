import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { loginDevice } from 'tp-link-tapo-connect';

import type { TapoHomebridgePlatform } from './TapoHomebridgePlatform.js';

export class TapoPlatformAccessory {
  private service: Service;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tapoDevice: any | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private loginPromise: Promise<any> | null = null;

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

  async setOn(value: CharacteristicValue) {
    try {
      const device = await this.getTapoDevice();
      await device.turnOn(value as boolean);
      this.platform.log.debug('Set Characteristic On ->', value);
    } catch (error) {
      this.platform.log.error('Failed to set On characteristic:', error);
    }
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
    try {
      const device = await this.getTapoDevice();
      await device.setBrightness(value as number);
      this.platform.log.debug('Set Characteristic Brightness -> ', value);
    } catch (error) {
      this.platform.log.error('Failed to set Brightness characteristic:', error);
    }
  }

  async setHue(value: CharacteristicValue) {
    try {
      const device = await this.getTapoDevice();
      const saturation = this.service.getCharacteristic(this.platform.Characteristic.Saturation).value as number;
      await device.setColor(value as number, saturation);
      this.platform.log.debug('Set Characteristic Hue -> ', value);
    } catch (error) {
      this.platform.log.error('Failed to set Hue characteristic:', error);
    }
  }

  async setSaturation(value: CharacteristicValue) {
    try {
      const device = await this.getTapoDevice();
      const hue = this.service.getCharacteristic(this.platform.Characteristic.Hue).value as number;
      await device.setColor(hue, value as number);
      this.platform.log.debug('Set Characteristic Saturation -> ', value);
    } catch (error) {
      this.platform.log.error('Failed to set Saturation characteristic:', error);
    }
  }
}
