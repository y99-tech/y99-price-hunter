// Mac: give the unsigned app an ad-hoc signature. Without one, Apple-silicon Macs refuse to open it
// ("app is damaged"). With it, users only see the normal "unidentified developer" prompt once.
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function afterPack(ctx) {
  if (ctx.electronPlatformName !== 'darwin' || process.platform !== 'darwin') return;
  // Universal builds pack an x64 and an arm64 copy first ("...-temp") and then merge them.
  // Sign only the merged app; signing the halves makes the merge fail.
  if (/-temp$/.test(ctx.appOutDir)) return;
  const app = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
};
