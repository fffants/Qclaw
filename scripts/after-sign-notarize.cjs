const path = require('node:path')

async function afterSign(context) {
  if (process.platform !== 'darwin') return
  if (String(process.env.QCLAW_SKIP_NOTARIZE || '').trim() === '1') {
    console.log('[after-sign-notarize] 检测到 QCLAW_SKIP_NOTARIZE=1，本次仅签名，不执行公证。')
    return
  }

  const { notarizeApp } = await import('./mac-notarytool.mjs')
  const productFilename = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${productFilename}.app`)

  console.log(`[after-sign-notarize] 开始公证并 staple：${appPath}`)
  const result = await notarizeApp(appPath)
  console.log(
    `[after-sign-notarize] 公证通过：${result.submission.id || 'unknown-id'}，状态 ${result.submission.status || 'unknown'}`
  )
}

module.exports = afterSign
module.exports.default = afterSign
