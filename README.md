# TXOne-Studio

A free, unofficial browser editor for the IK Multimedia TONEX® ONE pedal. Browse its stored presets, switch A/B/C slots, edit effects and parameters, and set or tap the global tempo.

TONEX® and TONEX ONE are trademarks of IK Multimedia Production Srl. TXOne-Studio is an independent project and is not affiliated with, endorsed by, sponsored by, or associated with IK Multimedia.

**[Open TXOne-Studio](https://yvr-vibe.github.io/txone-studio/)**

[Getting started guide](https://yvr-vibe.github.io/txone-studio/getting-started.html) — desktop and Android setup, controls, and troubleshooting.

## How to use

1. Connect your powered pedal to a desktop or Android device with a USB **data** cable. Android requires an OTG-capable connection.
2. Close IK Multimedia’s official TONEX Editor app and any other app using the pedal.
3. Open the app, press **Connect pedal**, and select the pedal when your browser asks for USB access.
4. Use **A/B/C** to select a slot. Selecting a preset from the list or pressing **Previous / Next** automatically loads it into that slot. Navigation follows the stored preset order.
5. Select an effect to edit it. By default, double-click or double-tap an effect card to turn it on or off. Choose **Single tap** in **Settings → Activation method** if preferred. EQ stays in the Amp section; tap **Tempo** repeatedly to set the tempo. Choosing a Mod/Delay **Division** automatically enables Sync for that effect.

Sliders use whole steps. For parameters that support decimals, enter them directly in the value box.

Use **Settings** in the bottom navigation for Master volume, Input trim, Tuning reference, Global bypass, Global cabinet bypass, and Direct monitoring. Global cabinet bypass disables cabinet simulation across presets. Master volume requires compatible pedal firmware. **Global Bypass** is also available beside **Next** and follows your activation preference. From A/B, Global bypass temporarily switches to C/Stomp mode, then returns to the original slot when turned off; C’s preset assignment stays unchanged. Settings changes are read back for confirmation; persistence after power-off has not been verified.

Choose **Explore demo** to try the interface without a pedal.

## Compatibility

Confirmed working in desktop Chrome and Android Chrome. Other browsers need compatible Web Serial (desktop) or WebUSB (Android) support. iPhone/iPad Safari is currently unsupported.

If the pedal does not appear or connect, check its power, the data cable, browser USB permissions, and that other editor apps are closed. Reconnect or refresh after the device sleeps.

## Important information

- Edits are live. Use IK Multimedia’s official TONEX Editor app to save changes permanently; do not assume they survive a preset switch or power cycle.
- **Export settings** downloads preset names and parameter values. It is not a complete preset backup and cannot be restored by this app.
- Pedal data stays between your browser and pedal.

## Privacy

The app has no analytics or visitor counter and does not upload pedal data. USB access requires your action and browser permission. Preset data is kept in memory while connected; the app does not save it to browser storage. Older unused preset caches are removed when the updated app opens.

Only theme and activation preferences are saved locally. Fonts are served with the app, without requests to Google Fonts. Export settings downloads preset names and parameter values to your device and omits the pedal serial number; share exported files only if you intend to share those settings.

[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) hosts the site and logs visitor IP addresses for security. PayPal opens only when you click Support this project; its own privacy policy applies there.

## Contact and license

Questions: [vanvibesmedia@gmail.com](mailto:vanvibesmedia@gmail.com). [Support this project](https://www.paypal.com/ncp/payment/A6DN7PPRV5PR6).

Released under the [MIT license](LICENSE), with [third-party notices](THIRD_PARTY_LICENSES.txt).
