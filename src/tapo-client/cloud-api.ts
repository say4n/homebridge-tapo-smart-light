import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import type { TapoDevice } from './types.js';

const BASE_URL = 'https://eu-wap.tplinkcloud.com/';

interface CloudLoginResponse {
  error_code: number;
  result: {
    token: string;
  };
}

interface DeviceListResponse {
  error_code: number;
  result: {
    deviceList: TapoDevice[];
  };
}

function checkError(response: { error_code: number; msg?: string }): void {
  if (response.error_code !== 0) {
    throw new Error(`Tapo Cloud API error ${response.error_code}: ${response.msg || 'Unknown error'}`);
  }
}

export async function cloudLogin(email: string, password: string) {
  const loginRequest = {
    method: 'login',
    params: {
      appType: 'Tapo_Ios',
      cloudPassword: password,
      cloudUserName: email,
      terminalUUID: uuidv4(),
    },
  };

  const response = await axios.post<CloudLoginResponse>(BASE_URL, loginRequest);
  checkError(response.data);

  const cloudToken = response.data.result.token;

  const listDevices = async (): Promise<TapoDevice[]> => {
    const getDeviceRequest = {
      method: 'getDeviceList',
    };

    const deviceResponse = await axios.post<DeviceListResponse>(
      BASE_URL,
      getDeviceRequest,
      {
        params: {
          token: cloudToken,
        },
      },
    );

    checkError(deviceResponse.data);
    return deviceResponse.data.result.deviceList;
  };

  const listDevicesByType = async (deviceType: string): Promise<TapoDevice[]> => {
    const devices = await listDevices();
    return devices.filter((d) => d.deviceType === deviceType);
  };

  return {
    listDevices,
    listDevicesByType,
  };
}
