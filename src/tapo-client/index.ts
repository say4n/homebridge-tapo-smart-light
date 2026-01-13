import { createKlapClient } from './klap-protocol.js';
import { resolveMacToIp } from './network-utils.js';
import type { TapoDevice, TapoDeviceClient } from './types.js';

export type { TapoDevice, TapoDeviceInfo, TapoDeviceClient } from './types.js';
export { cloudLogin } from './cloud-api.js';

/**
 * Login to a Tapo device and return a client interface
 * @param email - Tapo account email
 * @param password - Tapo account password
 * @param device - Device information including MAC address
 * @returns TapoDeviceClient interface for controlling the device
 */
export async function loginDevice(
  email: string,
  password: string,
  device: TapoDevice,
): Promise<TapoDeviceClient> {
  // If device already has IP, use it directly
  if (device.deviceIp) {
    return createKlapClient(email, password, device.deviceIp);
  }

  // Otherwise, resolve MAC to IP
  const localIp = await resolveMacToIp(device.deviceMac);

  if (!localIp) {
    throw new Error(`Local IP of device with MAC address ${device.deviceMac} not found. Make sure the device is on the same network.`);
  }

  return createKlapClient(email, password, localIp);
}

/**
 * Login to a Tapo device by IP address
 * @param email - Tapo account email
 * @param password - Tapo account password
 * @param deviceIp - Device IP address
 * @returns TapoDeviceClient interface for controlling the device
 */
export async function loginDeviceByIp(
  email: string,
  password: string,
  deviceIp: string,
): Promise<TapoDeviceClient> {
  return createKlapClient(email, password, deviceIp);
}
