import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function resolveMacToIp(macAddress: string): Promise<string | null> {
  try {
    // Normalize MAC address format
    const normalizedMac = macAddress.toLowerCase().replace(/[:-]/g, '');

    // Try arp -a command (works on macOS and Linux)
    const { stdout } = await execAsync('arp -a');
    const lines = stdout.split('\n');

    for (const line of lines) {
      const lineMac = line.toLowerCase().replace(/[:-]/g, '');
      if (lineMac.includes(normalizedMac)) {
        // Extract IP address - format is typically: hostname (192.168.1.x) at mac [ether] on interface
        const ipMatch = line.match(/\(([0-9.]+)\)/);
        if (ipMatch && ipMatch[1]) {
          return ipMatch[1];
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Failed to resolve MAC to IP:', error);
    return null;
  }
}
