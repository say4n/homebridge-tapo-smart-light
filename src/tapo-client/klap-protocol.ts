import axios from 'axios';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import type { TapoDeviceClient, TapoDeviceInfo } from './types.js';

const AES_CIPHER_ALGORITHM = 'aes-128-cbc';

function sha256(data: string | Buffer): Buffer {
  return createHash('sha256').update(data).digest();
}

function sha1(data: string | Buffer): Buffer {
  return createHash('sha1').update(data).digest();
}

function encode(text: string): Buffer {
  return Buffer.from(text, 'utf-8');
}

function generateAuthHash(email: string, password: string): Buffer {
  return sha256(Buffer.concat([sha1(encode(email)), sha1(encode(password))]));
}

function handshake1AuthHash(localSeed: Buffer, remoteSeed: Buffer, authHash: Buffer): Buffer {
  return sha256(Buffer.concat([localSeed, remoteSeed, authHash]));
}

function handshake2AuthHash(localSeed: Buffer, remoteSeed: Buffer, authHash: Buffer): Buffer {
  return sha256(Buffer.concat([remoteSeed, localSeed, authHash]));
}

function deriveKey(localSeed: Buffer, remoteSeed: Buffer, userHash: Buffer): Buffer {
  return sha256(Buffer.concat([encode('lsk'), localSeed, remoteSeed, userHash])).slice(0, 16);
}

function deriveIv(localSeed: Buffer, remoteSeed: Buffer, userHash: Buffer): Buffer {
  return sha256(Buffer.concat([encode('iv'), localSeed, remoteSeed, userHash]));
}

function deriveSig(localSeed: Buffer, remoteSeed: Buffer, userHash: Buffer): Buffer {
  return sha256(Buffer.concat([encode('ldk'), localSeed, remoteSeed, userHash])).slice(0, 28);
}

function deriveSeqFromIv(iv: Buffer): Buffer {
  return iv.slice(iv.length - 4);
}

function ivWithSeq(iv: Buffer, seq: Buffer): Buffer {
  return Buffer.concat([iv.slice(0, 12), seq]);
}

function incrementSeq(seq: Buffer): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeInt32BE(seq.readInt32BE() + 1);
  return buffer;
}

export async function createKlapClient(
  email: string,
  password: string,
  deviceIp: string,
): Promise<TapoDeviceClient> {
  // Handshake 1
  const localSeed = randomBytes(16);

  const handshake1Response = await axios.post(`http://${deviceIp}/app/handshake1`, localSeed, {
    responseType: 'arraybuffer',
    withCredentials: true,
    timeout: 10000,
  });

  const responseBytes = Buffer.from(handshake1Response.data);
  const setCookieHeader = handshake1Response.headers['set-cookie']?.[0];
  if (!setCookieHeader) {
    throw new Error('No session cookie received from device');
  }
  const sessionCookie = setCookieHeader.substring(0, setCookieHeader.indexOf(';'));

  const remoteSeed = responseBytes.slice(0, 16);
  const serverHash = responseBytes.slice(16);

  const localAuthHash = generateAuthHash(email, password);
  const localSeedAuthHash = handshake1AuthHash(localSeed, remoteSeed, localAuthHash);

  if (localSeedAuthHash.compare(serverHash) !== 0) {
    throw new Error('Authentication failed: email or password incorrect');
  }

  // Handshake 2
  const payload = handshake2AuthHash(localSeed, remoteSeed, localAuthHash);
  await axios.post(`http://${deviceIp}/app/handshake2`, payload, {
    responseType: 'arraybuffer',
    headers: {
      Cookie: sessionCookie,
    },
    timeout: 10000,
  });

  // Create encryption session
  const key = deriveKey(localSeed, remoteSeed, localAuthHash);
  const iv = deriveIv(localSeed, remoteSeed, localAuthHash);
  const sig = deriveSig(localSeed, remoteSeed, localAuthHash);
  let seq = deriveSeqFromIv(iv);

  const encrypt = (payload: object): Buffer => {
    const payloadJson = JSON.stringify(payload);
    const cipher = createCipheriv(AES_CIPHER_ALGORITHM, key, ivWithSeq(iv, seq));
    const ciphertext = cipher.update(encode(payloadJson));
    return Buffer.concat([ciphertext, cipher.final()]);
  };

  const decrypt = (payload: Buffer): unknown => {
    const cipher = createDecipheriv(AES_CIPHER_ALGORITHM, key, ivWithSeq(iv, seq));
    const ciphertext = cipher.update(payload.slice(32));
    return JSON.parse(Buffer.concat([ciphertext, cipher.final()]).toString());
  };

  const encryptAndSign = (payload: object): Buffer => {
    const ciphertext = encrypt(payload);
    const signature = sha256(Buffer.concat([sig, seq, ciphertext]));
    return Buffer.concat([signature, ciphertext]);
  };

  const send = async (deviceRequest: object): Promise<unknown> => {
    seq = incrementSeq(seq);
    const encryptedRequest = encryptAndSign(deviceRequest);

    const response = await axios({
      method: 'post',
      url: `http://${deviceIp}/app/request`,
      data: encryptedRequest,
      responseType: 'arraybuffer',
      headers: {
        Cookie: sessionCookie,
      },
      params: {
        seq: seq.readInt32BE(),
      },
      timeout: 10000,
    });

    const decryptedResponse = decrypt(response.data) as { error_code?: number; result?: unknown };

    if (decryptedResponse.error_code && decryptedResponse.error_code !== 0) {
      throw new Error(`Device error: ${decryptedResponse.error_code}`);
    }

    return decryptedResponse.result;
  };

  // Return device client interface
  return {
    async turnOn(transitionMs?: number): Promise<void> {
      const params: Record<string, unknown> = {
        device_on: true,
      };

      if (transitionMs !== undefined) {
        params.transition_period = transitionMs;
      }

      await send({
        method: 'set_device_info',
        params,
      });
    },

    async turnOff(transitionMs?: number): Promise<void> {
      const params: Record<string, unknown> = {
        device_on: false,
      };

      if (transitionMs !== undefined) {
        params.transition_period = transitionMs;
      }

      await send({
        method: 'set_device_info',
        params,
      });
    },

    async setBrightness(level: number, transitionMs?: number): Promise<void> {
      const normalizedLevel = Math.max(0, Math.min(100, level));
      const params: Record<string, unknown> = {
        brightness: normalizedLevel,
      };

      if (transitionMs !== undefined) {
        params.transition_period = transitionMs;
      }

      await send({
        method: 'set_device_info',
        params,
      });
    },

    async setHSL(hue: number, saturation: number, brightness: number, transitionMs?: number): Promise<void> {
      const normalizedHue = hue % 360;
      const normalizedSat = Math.max(0, Math.min(100, saturation));
      const normalizedBrightness = Math.max(0, Math.min(100, brightness));

      const params: Record<string, unknown> = {
        hue: normalizedHue,
        saturation: normalizedSat,
        brightness: normalizedBrightness,
      };

      if (transitionMs !== undefined) {
        params.transition_period = transitionMs;
      }

      await send({
        method: 'set_device_info',
        params,
      });
    },

    async getDeviceInfo(): Promise<TapoDeviceInfo> {
      const result = (await send({
        method: 'get_device_info',
      })) as TapoDeviceInfo;
      return result;
    },
  };
}
