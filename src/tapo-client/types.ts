export interface TapoDevice {
  deviceType: string;
  deviceModel: string;
  deviceId: string;
  deviceMac: string;
  alias: string;
  deviceIp?: string;
}

export interface TapoDeviceInfo {
  device_id: string;
  device_on: boolean;
  brightness?: number;
  hue?: number;
  saturation?: number;
  color_temp?: number;
  nickname?: string;
  ssid?: string;
}

export interface TapoDeviceClient {
  turnOn(): Promise<void>;
  turnOff(): Promise<void>;
  setBrightness(level: number): Promise<void>;
  setHSL(hue: number, saturation: number, brightness: number): Promise<void>;
  setColorTemperature(colorTemp: number, brightness: number): Promise<void>;
  getDeviceInfo(): Promise<TapoDeviceInfo>;
}
