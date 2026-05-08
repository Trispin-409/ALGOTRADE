import fs from 'fs';
import path from 'path';

const iconPath = path.join(process.cwd(), 'public', 'icon.png');
const icon192Path = path.join(process.cwd(), 'public', 'icon-192.png');
const icon512Path = path.join(process.cwd(), 'public', 'icon-512.png');

if (fs.existsSync(iconPath)) {
    fs.copyFileSync(iconPath, icon192Path);
    fs.copyFileSync(iconPath, icon512Path);
    console.log('Icons copied successfully');
} else {
    console.error('Source icon.png not found');
}
