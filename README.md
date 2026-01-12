<p align="center">
  <img src="https://github.com/say4n/homebridge-tapo-smart-light/raw/main/Homebridge-Tapo.png" width="150">
</p>

<span align="center">

# Homebridge Tapo L630

</span>

This is a Homebridge plugin for controlling TP-Link Tapo L630 smart lights.

## Installation

1.  Install Homebridge using the official instructions: `npm install -g homebridge`
2.  Install this plugin using: `npm install -g homebridge-tapo-smart-light`
3.  Update your configuration file. See the sample below.

## Configuration

Add the following platform to your `config.json` file:

```json
{
  "platforms": [
    {
      "platform": "Tapo",
      "name": "Tapo",
      "email": "YOUR_TAPO_EMAIL",
      "password": "YOUR_TAPO_PASSWORD"
    }
  ]
}
```

## Features

*   Turn lights on and off.
*   Adjust brightness.
*   Change colors (hue and saturation).

## Development

To develop this plugin:

1.  Clone the repository.
2.  Install the dependencies: `npm install`
3.  Build the plugin: `npm run build`
4.  Link the plugin for local development: `npm link`
5.  Run Homebridge in debug mode: `homebridge -D`
