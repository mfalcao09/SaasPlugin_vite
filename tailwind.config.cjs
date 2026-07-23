const nexvyPreset = require('./tailwind-preset.cjs');

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [nexvyPreset],
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
};
