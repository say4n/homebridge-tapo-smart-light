# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm run build      # Build TypeScript to dist/
npm run lint       # Run ESLint with zero warnings allowed
npm run watch      # Build, link, and run with nodemon for development
```

For local development testing with Homebridge:

```bash
npm link           # Link plugin globally
homebridge -D      # Run Homebridge in debug mode
```

## Architecture

This is a Homebridge plugin for TP-Link Tapo L630 smart bulbs. It uses a two-layer API approach:

### Cloud API (`tapo-client/cloud-api.ts`)

- Authenticates with TP-Link cloud (`eu-wap.tplinkcloud.com`)
- Discovers devices linked to user's account
- Returns device metadata including MAC addresses

### Local KLAP Protocol (`tapo-client/klap-protocol.ts`)

- Direct local network communication with bulbs via HTTP
- Custom encrypted protocol using AES-128-CBC with two-phase handshake
- Handles: `turnOn`, `turnOff`, `setBrightness`, `setHSL`, `setColorTemperature`, `getDeviceInfo`
- Session cookies expire; 403 errors trigger `SessionExpiredError` for re-auth

### Device Discovery Flow

1. `TapoHomebridgePlatform` authenticates with cloud API
2. Fetches device list filtered by `SMART.TAPOBULB` type
3. For each device, resolves MAC → IP via `arp -a` (`network-utils.ts`)
4. Creates `TapoPlatformAccessory` which establishes local KLAP session

### Accessory State Management (`TapoPlatformAccessory.ts`)

- Debounces HomeKit characteristic changes (300ms) before sending to device
- Implements client-side gradual transitions for smooth brightness/on-off fades
- Configurable `transitionDuration` (0-5000ms, default 200ms)
- `withRetry` wrapper handles session expiration transparently

### Color Modes

Tapo bulbs have two mutually exclusive color modes:

- **HSL mode**: Set `color_temp: 0` along with hue/saturation values
- **Color temperature mode**: Set `color_temp` in Kelvin (2500-6500K)

HomeKit uses Mireds for color temperature (154-400 range). Conversion: `Kelvin = 1,000,000 / Mireds`
