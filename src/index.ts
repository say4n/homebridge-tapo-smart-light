import type { API } from 'homebridge';

import { TapoHomebridgePlatform } from './TapoHomebridgePlatform.js';
import { PLATFORM_NAME } from './settings.js';

/**
 * This method registers the platform with Homebridge
 */
export default (api: API) => {
  api.registerPlatform(PLATFORM_NAME, TapoHomebridgePlatform);
};
