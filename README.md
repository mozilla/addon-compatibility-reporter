# Add-on Compatibility Reporter (ACR)

ACR is an add-on for Firefox that lets you report whether add-ons are compatible with your version of Firefox. This includes reporting on [multiprocess compatibility](https://wiki.mozilla.org/Firefox/multiprocess).

Mozilla monitors these reports and keeps an eye on misbehaving add-ons to ensure Firefox users have the best experience.

This version of ACR is built with the Add-ons SDK, available for download at: https://addons.mozilla.org/developers/builder

Project page: https://wiki.mozilla.org/AMO:Projects/ACR

Developed by Mozilla in collaboration with Briks Software: http://briks.si

## Installation

If you want to install this add-on as an end-user, please [download it from the Mozilla Add-ons site](https://addons.mozilla.org/en-GB/firefox/addon/add-on-compatibility-reporter/).

## Development

To work on ACR, use [`jpm`](https://github.com/mozilla-jetpack/jpm). You'll need [node/npm](http://nodejs.org/) installed.

```bash
npm install -g jpm
git clone git@github.com:mozilla/addon-compatibility-reporter.git
```

Then use `jpm run` inside your ACR folder. A new Firefox profile with ACR installed will appear.

### Test against a local `addons-server`

If you want to test your reports against a local `addons-server` instance and have followed [`addons-server`'s install docs](http://addons-server.readthedocs.io/en/latest/topics/install/index.html), you can change `extensions.acr.amo_host` in `about:config` to `http://olympia.dev`.
