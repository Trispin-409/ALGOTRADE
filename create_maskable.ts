import Jimp from 'jimp';
import fs from 'fs';

async function main() {
  try {
    const inputPath = '/app/applet/android/launchericon-512x512.png';
    const img = await Jimp.read(inputPath);
    img.scaleToFit(410, 410);
    
    // Create new blank image with transparent background (Jimp 0.22 bg is 0x00000000)
    const bg = new Jimp(512, 512, 0x00000000); 
    bg.composite(img, Math.floor((512 - img.bitmap.width) / 2), Math.floor((512 - img.bitmap.height) / 2));
    await bg.writeAsync('/app/applet/public/icons/icon-512-maskable.png');
    console.log('Successfully generated maskable icon with Jimp 0.22.10');
  } catch(e) {
    console.error(e);
  }
}
main();
