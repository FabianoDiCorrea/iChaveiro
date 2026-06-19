const pngToIco = require('png-to-ico');
const fs = require('fs');

pngToIco('public/icon_real.png')
  .then(buf => {
    fs.writeFileSync('public/icon.ico', buf);
    console.log('Icon written successfully');
  })
  .catch(console.error);
