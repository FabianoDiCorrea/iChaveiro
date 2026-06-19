const { Jimp } = require('jimp');

async function main() {
  try {
    const img = await Jimp.read('public/icon.png');
    img.resize({ w: 256, h: 256 });
    await img.write('public/icon_real.png');
    console.log("Success");
  } catch (e) {
    console.error(e);
  }
}
main();
