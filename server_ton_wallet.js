// server_wallet.js
require('dotenv').config();
const TonWeb = require('tonweb');
const tonMnemonic = require('tonweb-mnemonic');

const provider = new TonWeb.HttpProvider(process.env.TON_API);
const tonweb = new TonWeb(provider);
const WalletClass = tonweb.wallet.all.v3R2;

let wallet, keyPair;

async function init() {
  if (!wallet) {
    const mnemonics = process.env.SERVER_WALLET_MNEMONIC.split(' ');
    keyPair = await tonMnemonic.mnemonicToKeyPair(mnemonics);
    wallet = new WalletClass(tonweb.provider, {
      publicKey: keyPair.publicKey,
      wc: 0,
    });
  }
  return wallet;
}

// 获取钱包地址
async function getAddress() {
  await init();
  const address = await wallet.getAddress();
  return address.toString(true, true, false); // Non-bounceable base64
}

// 获取当前余额（单位为 nanoTON）
async function getBalance() {
  await init();
  const address = await wallet.getAddress();
  const info = await tonweb.provider.getAddressInfo(address.toString());
  return info.balance; // string，单位为 nanoTON
}

// 判断钱包是否已部署
async function isDeployed() {
  await init();
  try {
    const seqno = await wallet.methods.seqno().call();
    return typeof seqno === 'number' && seqno >= 0;
  } catch (err) {
    console.error('[server_wallet] 检查钱包是否部署失败:', err);
    return false;
  }
}

// 等待有效 seqno
async function waitForSeqno(maxTries = 10, delay = 3000) {
  for (let i = 0; i < maxTries; i++) {
    const seqno = await wallet.methods.seqno().call();
    if (typeof seqno === 'number' && seqno >= 0) {
      return seqno;
    }
    console.log(`[server_wallet] 第 ${i + 1} 次尝试获取 seqno，当前为:`, seqno);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  throw new Error('无法获取有效的 seqno');
}

// 向某地址发送 TON
async function sendTon(toAddress, amountTON) {
  await init();
  try {
    const deployed = await isDeployed();
    if (!deployed) {
      throw new Error('服务器钱包尚未部署，无法发送交易');
    }

    const seqno = await waitForSeqno();

    const amountNano = TonWeb.utils.toNano(amountTON.toString());

    console.log(`[server_wallet] 发送 ${amountTON} TON 到 ${toAddress}，当前 seqno=${seqno}`);

    const result = await wallet.methods.transfer({
      secretKey: keyPair.secretKey,
      toAddress,
      amount: amountNano,
      seqno,
      payload: null,
      sendMode: 3,
    }).send();

    console.log('[server_wallet] 转账已发送');

    return result;
  } catch (err) {
    console.error('[server_wallet] 转账失败:', err);
    throw new Error('服务器钱包转账失败: ' + err.message);
  }
}

// 部署钱包
async function deploy() {
  await init();

  try {
    const seqno = await waitForSeqno();
    const amountNano = TonWeb.utils.toNano('0.05'); // 建议部署费用留足

    console.log('[server_wallet] 部署钱包中...');

    const result = await wallet.methods.deploy({
      secretKey: keyPair.secretKey,
      sendMode: 3,
      amount: amountNano,
      seqno,
    }).send();

    console.log('[server_wallet] 钱包部署成功');
    return result;
  } catch (err) {
    console.error('[server_wallet] 部署钱包失败:', err);
    throw new Error('钱包部署失败: ' + err.message);
  }
}

module.exports = {
  init,
  getAddress,
  getBalance,
  sendTon,
  isDeployed,
  deploy,
};
