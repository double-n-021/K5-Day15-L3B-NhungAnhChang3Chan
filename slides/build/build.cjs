// Rebuild the offline presentation after editing index.html or screenshots.
const fs = require('node:fs');
const path = require('node:path');
let count = 0;
let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
html = html.replace(/src="app-screenshots\/([^"]+)"/g, (_, file) => {
  count++;
  return `src="data:image/png;base64,${fs.readFileSync(path.join(__dirname, 'app-screenshots', file)).toString('base64')}"`;
});
const times = [...html.matchAll(/data-time="(\d+)"/g)].map(match => Number(match[1]));
new Function(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
if (count !== 8 || times.length !== 7 || times.reduce((a,b) => a+b, 0) !== 270) {
  throw new Error('Expected eight screenshots, seven slides and 270 seconds.');
}
fs.writeFileSync(path.join(__dirname, 'chargepilot.html'), html);
console.log('Built chargepilot.html: 7 slides, 8 embedded screenshots, 4:30; JavaScript syntax valid.');
