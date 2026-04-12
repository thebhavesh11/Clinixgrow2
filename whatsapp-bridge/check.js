const p = require('puppeteer/package.json');
const w = require('whatsapp-web.js/package.json');
console.log('puppeteer:', p.version);
console.log('whatsapp-web.js:', w.version);
console.log('node:', process.version);
console.log('chromium:', require('puppeteer').executablePath());
