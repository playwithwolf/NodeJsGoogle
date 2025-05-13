// server_wallet.js
require('dotenv').config();
const TonWeb = require('tonweb');
const tonMnemonic = require('tonweb-mnemonic');

const provider = new TonWeb.HttpProvider(process.env.TESTNET_TON_API,{
    apiKey: process.env.TESTNET_API_KEY
});
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
  console.log('状态:', info.state);
  console.log('余额:', info.balance);
  return info.balance; // string，单位为 nanoTON
}


 

// 判断钱包是否已部署
async function isDeployed() {
 await init();
  const address = await wallet.getAddress();
  const info = await tonweb.provider.getAddressInfo(address.toString());
  return info.code !== null; // 有 code 表示合约已部署
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

    const toAddressStr = new TonWeb.utils.Address(toAddress).toString(true, false, false);

    const seqno = await waitForSeqno();

    const amountNano = TonWeb.utils.toNano(amountTON.toString());

    console.log(`[server_wallet] 发送 ${amountTON} TON 到 ${toAddressStr}，当前 seqno=${seqno}`);

    const sendTransaction = async () => {
      return wallet.methods.transfer({
        secretKey: keyPair.secretKey,
        toAddress: toAddressStr,
        amount: amountNano,
        seqno,
        payload: null,
        sendMode: 3,
      }).send();
    };

    let retries = 0;
    const maxRetries = 5;  // 设置最大重试次数
    const delayTime = 5000;  // 每次重试间隔 5 秒

    // 重试机制
    let result = 'Ratelimit exceed';
    while (retries < maxRetries) {
      if(JSON.stringify(result) == 'Ratelimit exceed'){
        result = await sendTransaction();
        console.log('[server_wallet] 转账已发送 ');
        console.log('[server_wallet] 转账结果:', JSON.stringify(result));
        console.log('Transaction hash:', result.hash);  // 打印交易哈希
        console.log('Transaction status:', result.status);  // 打印交易状态
        console.log('Transaction details:', JSON.stringify(result, null, 2));  // 打印详细的 JSON 格式内容
        if(result.hash!=undefined)
          break;  // 成功则跳出循环
     
        
          console.log('[server_wallet] 遇到速率限制，等待重试...');
          retries++;
          if (retries >= maxRetries) {
            throw new Error('[server_wallet] 达到最大重试次数，仍然遭遇 Ratelimit exceed 错误');
          }
          await new Promise(r => setTimeout(r, delayTime));  // 等待 5 秒再重试
        
     
    }

    // 等待 seqno + 1
    for (let i = 0; i < 10; i++) {
      const newSeqno = await wallet.methods.seqno().call();
      console.log(`[server_wallet] 第 ${i + 1} 次尝试获取 seqno，newSeqno 当前为:`, newSeqno);
      if (newSeqno > seqno) {
        console.log('[server_wallet] 转账已确认 on-chain');
        return result;
      }
      await new Promise(r => setTimeout(r, 5000));
    }

    throw new Error('服务器钱包转账交易未确认');
  } catch (err) {
    console.error('[server_wallet] 转账失败:', err);
    throw new Error('服务器钱包转账失败: ' + err.message);
  }
}


// 部署钱包
async function deploy() {
  await init();
  const address = await wallet.getAddress();
  try {
    const seqno = 0
    const amountNano = TonWeb.utils.toNano('0.05'); // 建议部署费用留足

    console.log('[server_wallet] 部署钱包中...');

    await wallet.methods.transfer({
      secretKey: keyPair.secretKey,
      toAddress: address, // ✅ 发给自己
      amount: amountNano,
      seqno,
      sendMode: 3,
    }).send();


    console.log('[server_wallet] 钱包部署成功');
   
  } catch (err) {
    console.error('[server_wallet] 部署钱包失败:', err);
    throw new Error('钱包部署失败: ' + err.message);
  }
}


async function checkBalanceDebug() {
  await init();
  const address = await wallet.getAddress();

  console.log('[地址格式]');
  console.log('raw:', address.toString(false, false, false));
  console.log('non-bounceable:', address.toString(true, true, false));
  console.log('bounceable:', address.toString(true, true, true));

  const info = await tonweb.provider.getAddressInfo(address.toString(false, false, false));
  console.log('[balance]', info.balance);
}

module.exports = {
  init,
  getAddress,
  getBalance,
  sendTon,
  isDeployed,
  deploy,
  checkBalanceDebug,
};
