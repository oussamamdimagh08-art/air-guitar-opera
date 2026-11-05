/* Air Guitar Opera - Premium Sound Upgrade
   Keeps the existing design and hand tracking unchanged.
   Manual Live: acoustic steel guitar.
   Opera Song: warm cello-inspired concert sound.
*/
(() => {
  'use strict';

  let context = null;
  let player = null;
  let output = null;
  let ready = false;

  const STEEL_GUITAR = () => window._tone_0250_LK_AcousticSteel_SF2_file;
  const CELLO = () => window._tone_0420_FluidR3_GM_sf2_file;

  function ensureEngine() {
    if (ready) {
      if (context.state === 'suspended') context.resume();
      return true;
    }

    if (typeof window.WebAudioFontPlayer !== 'function') {
      console.error('WebAudioFontPlayer did not load.');
      return false;
    }

    if (!STEEL_GUITAR() || !CELLO()) {
      console.error('Instrument presets did not load.');
      return false;
    }

    context = new (window.AudioContext || window.webkitAudioContext)();
    player = new window.WebAudioFontPlayer();
    output = context.createGain();
    output.gain.value = Number(document.getElementById('masterVolume')?.value || 0.18) * 2.4;
    output.connect(context.destination);

    player.loader.decodeAfterLoading(context, '_tone_0250_LK_AcousticSteel_SF2_file');
    player.loader.decodeAfterLoading(context, '_tone_0420_FluidR3_GM_sf2_file');

    const volume = document.getElementById('masterVolume');
    if (volume) {
      volume.addEventListener('input', () => {
        if (!context || !output) return;
        output.gain.setTargetAtTime(Number(volume.value) * 2.4, context.currentTime, 0.025);
      });
    }

    ready = true;
    return true;
  }

  function frequencyToMidi(frequency) {
    return Math.max(24, Math.min(96, Math.round(69 + 12 * Math.log2(frequency / 440))));
  }

  function isOperaMode() {
    return document.getElementById('operaModeButton')?.classList.contains('active');
  }

  function premiumPluck(frequency, intensity = 0.65, delay = 0) {
    if (!ensureEngine()) return;

    const opera = isOperaMode();
    const preset = opera ? CELLO() : STEEL_GUITAR();
    const pitch = frequencyToMidi(frequency);
    const duration = opera ? 2.9 : 1.75;
    const volume = opera
      ? Math.min(0.72, 0.31 + intensity * 0.32)
      : Math.min(0.78, 0.34 + intensity * 0.38);

    const when = context.currentTime + Math.max(0, delay);
    player.queueWaveTable(context, output, preset, when, pitch, duration, volume);
  }

  function cancelPremiumSound() {
    if (player && context) player.cancelQueue(context);
  }

  function installOverrides() {
    ensureEngine();

    // The current app declares pluck() globally. Replacing the global binding
    // upgrades every manual note and every Opera Song note without changing UI.
    window.pluck = premiumPluck;

    const originalStopAll = window.stopAll;
    window.stopAll = function () {
      cancelPremiumSound();
      if (typeof originalStopAll === 'function') originalStopAll();
    };

    document.getElementById('stopButton')?.addEventListener('click', cancelPremiumSound);
    document.getElementById('manualModeButton')?.addEventListener('click', cancelPremiumSound);
    document.getElementById('pauseSongButton')?.addEventListener('click', () => {
      const button = document.getElementById('pauseSongButton');
      if (button?.textContent.trim() === 'RESUME') cancelPremiumSound();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) cancelPremiumSound();
    });
    window.addEventListener('blur', cancelPremiumSound);
    window.addEventListener('beforeunload', cancelPremiumSound);

    const status = document.getElementById('soundStatus');
    if (status) status.textContent = 'SOUND: PREMIUM STRINGS READY';
  }

  // Installation must occur after app.js has created its global functions.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installOverrides, { once: true });
  } else {
    installOverrides();
  }
})();
