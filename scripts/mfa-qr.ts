// Local-only QR renderer: no network requests and no secret output.
import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
async function main() {
const input = process.env.MFA_ENROLLMENT_FILE;
const output = process.env.MFA_QR_FILE;
if (!input || !output || !path.isAbsolute(output) || /(^|[\\/])public([\\/]|$)/i.test(output)) throw new Error('Set protected MFA_ENROLLMENT_FILE and absolute MFA_QR_FILE outside public.');
const relative = path.relative(path.resolve(__dirname, '..'), path.resolve(output));
if (!relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)) throw new Error('QR output must be outside the repository.');
const uri = fs.readFileSync(input, 'utf8').trim();
if (!uri.startsWith('otpauth://totp/')) throw new Error('Expected local TOTP enrollment file.');
const png = await QRCode.toBuffer(uri, { type: 'png', errorCorrectionLevel: 'M' });
fs.writeFileSync(output, png, { flag: 'wx', mode: 0o600 });
console.log('Protected local QR created. Delete both enrollment artifacts after verified enrollment.');

}
main().catch(() => { console.error('Local QR generation failed. Check protected input, output location and exclusive file permissions.'); process.exitCode = 1; });
