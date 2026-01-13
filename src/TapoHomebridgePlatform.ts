import type { API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import { cloudLogin } from './tapo-client/index.js';

import { TapoPlatformAccessory } from './TapoPlatformAccessory.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';

export class TapoHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  public readonly accessories: Map<string, PlatformAccessory> = new Map();
  public readonly discoveredCacheUUIDs: string[] = [];

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    this.log.debug('Finished initializing platform:', this.config.name);

    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      this.discoverDevices();
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.set(accessory.UUID, accessory);
  }

  async discoverDevices() {
    const { email, password } = this.config;

    if (!email || !password) {
      this.log.error('Email or password not configured. Please check your Homebridge configuration.');
      return;
    }

    try {
      const cloudApi = await cloudLogin(email, password);
      const devices = await cloudApi.listDevicesByType('SMART.TAPOBULB');

      for (const deviceInfo of devices) {
        const uuid = this.api.hap.uuid.generate(deviceInfo.deviceId);
        const existingAccessory = this.accessories.get(uuid);

        if (existingAccessory) {
          this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
          new TapoPlatformAccessory(this, existingAccessory);
        } else {
          this.log.info('Adding new accessory:', deviceInfo.alias);
          const accessory = new this.api.platformAccessory(deviceInfo.alias, uuid);
          accessory.context.device = deviceInfo;
          new TapoPlatformAccessory(this, accessory);
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
        this.discoveredCacheUUIDs.push(uuid);
      }

      for (const [uuid, accessory] of this.accessories) {
        if (!this.discoveredCacheUUIDs.includes(uuid)) {
          this.log.info('Removing existing accessory from cache:', accessory.displayName);
          this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
      }
    } catch (error) {
      this.log.error('Failed to discover devices:', error);
    }
  }
}
