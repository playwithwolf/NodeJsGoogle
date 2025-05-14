// server_wallet.js
require('dotenv').config();
const TonWeb = require('tonweb');
const tonMnemonic = require('tonweb-mnemonic');
const { v4: uuidv4 } = require('uuid');
const fetch = require('node-fetch');


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

// 等待有效 seqno
async function waitForClientSeqno(wallet,maxTries = 10, delay = 3000) {
  for (let i = 0; i < maxTries; i++) {
    const seqno = await wallet.methods.seqno().call();
    if (typeof seqno === 'number' && seqno >= 0) {
      return seqno;
    }
    console.log(`[client_wallet] 第 ${i + 1} 次尝试获取 seqno，当前为:`, seqno);
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
      }).send();  // 注意：这只返回 `@type: "ok"`
    };

    let retries = 0;
    const maxRetries = 5;
    const delayTime = 5000;
    let result;

    // ========== 发送交易重试 ==========
    while (retries < maxRetries) {
      try {
        result = await sendTransaction();
        console.log('[server_wallet] 转账请求:', JSON.stringify(result));

        if (result && result['@type'] === 'ok') {
          console.log('[server_wallet] 转账请求发送成功:', JSON.stringify(result));
          break;  // 表示 send() 成功调用
        }
      } catch (err) {
        if (err.message.includes('Ratelimit exceed')) {
          console.warn('[server_wallet] 遇到速率限制，等待重试...');
        } else {
          console.error('[server_wallet] 转账失败:', err.message);
          throw new Error('[server_wallet] 转账失败: ' + err.message);
        }
      }

      retries++;
      if (retries >= maxRetries) {
        throw new Error('[server_wallet] 达到最大重试次数，仍然无法发送交易');
      }
      await new Promise(r => setTimeout(r, delayTime));
    }

     
  } catch (err) {
    console.error('[server_wallet] 转账失败:', err);
    throw new Error('服务器钱包转账失败: ' + err.message);
  }
}


async function sendTonHaveOrderId(toAddress, amountTON, orderId) {
  await init();
  try {
    const deployed = await isDeployed();
    if (!deployed) {
      throw new Error('服务器钱包尚未部署，无法发送交易');
    }

    const toAddressStr = new TonWeb.utils.Address(toAddress).toString(true, true, false);
    const seqno = await waitForSeqno();
    const amountNano = TonWeb.utils.toNano(amountTON.toString());

    console.log(`[server_wallet] 发送 ${amountTON} TON 到 ${toAddressStr}，当前 seqno=${seqno}`);

 

    //const payloadbyte = TonWeb.utils.stringToBytes(orderId);
    const payloadCell = new TonWeb.boc.Cell();
    payloadCell.bits.writeString(orderId); 

    const sendTransaction = async () => {
      return wallet.methods.transfer({
        secretKey: keyPair.secretKey,
        toAddress: toAddressStr,
        amount: amountNano,
        seqno,
        payload: payloadCell,
        message: orderId,
        sendMode: 3,
      }).send();  // 注意：这只返回 `@type: "ok"`
    };

    let retries = 0;
    const maxRetries = 5;
    const delayTime = 5000;
    let result;

    // ========== 发送交易重试 ==========
    while (retries < maxRetries) {
      try {
        result = await sendTransaction();
        console.log('[server_wallet] 转账请求:', JSON.stringify(result));

        if (result && result['@type'] === 'ok') {
          console.log('[server_wallet] 转账请求发送成功:', JSON.stringify(result));
          break;  // 表示 send() 成功调用
        }
      } catch (err) {
        if (err.message.includes('Ratelimit exceed')) {
          console.warn('[server_wallet] 遇到速率限制，等待重试...');
        } else {
          console.error('[server_wallet] 转账失败:', err.message);
          throw new Error('[server_wallet] 转账失败: ' + err.message);
        }
      }

      retries++;
      if (retries >= maxRetries) {
        throw new Error('[server_wallet] 达到最大重试次数，仍然无法发送交易');
      }
      await new Promise(r => setTimeout(r, delayTime));
    }

     
  } catch (err) {
    console.error('[server_wallet] 转账失败:', err);
    throw new Error('服务器钱包转账失败: ' + err.message);
  }
}


async function sentClientTonHaveOrderId(client_wallet, amountTON, orderId, keyPair) {
  await init(); // 初始化 tonweb/provider/server 钱包等

  const toAddress = await getAddress();
  const toAddressStr = new TonWeb.utils.Address(toAddress).toString(true, true, false);

  const client_address = await client_wallet.getAddress();
  const clientAddressStr = new TonWeb.utils.Address(client_address).toString(true, true, false);

  // 确保客户端钱包已经部署
  const clientInfo = await tonweb.provider.getAddressInfo(clientAddressStr);
  if (clientInfo.state !== 'active') {
    throw new Error(`[${clientAddressStr}] 客户端钱包尚未部署，不能转账`);
  }

  // 获取最新 seqno
  const seqno = await client_wallet.methods.seqno().call();
  const amountNano = TonWeb.utils.toNano(amountTON.toString());

  console.log(`[${clientAddressStr}] 正在向服务器转账 ${amountTON} TON，seqno=${seqno}`);

  const payloadCell = new TonWeb.boc.Cell();
  payloadCell.bits.writeString(orderId);

  const sendTransaction_client = async () => {
    return await client_wallet.methods.transfer({
      secretKey: keyPair.secretKey,
      toAddress: toAddressStr,
      amount: amountNano,
      seqno: seqno,
      payload: payloadCell,
      message: orderId,
      sendMode: 3
    }).send();
  };

  let retries = 0;
  const maxRetries = 5;
  const delayTime = 5000;
  let result;

  while (retries < maxRetries) {
    try {
      result = await sendTransaction_client();
      console.log(`[${clientAddressStr}] 转账请求:`, result);

      if (result && result['@type'] === 'ok') {
        console.log(`[${clientAddressStr}] 转账请求发送成功`);
        break;
      }
    } catch (err) {
      console.error(`[${clientAddressStr}] 转账异常:`, err);

      if (typeof err?.message === 'string' && err.message.includes('Ratelimit exceed')) {
        console.warn(`[${clientAddressStr}] 遇到速率限制，等待重试...`);
      } else {
        throw new Error(`[${clientAddressStr}] 转账失败: ${err?.message || String(err)}`);
      }
    }

    retries++;
    if (retries >= maxRetries) {
      throw new Error(`[${clientAddressStr}] 达到最大重试次数，仍然无法发送交易`);
    }

    await new Promise(r => setTimeout(r, delayTime));
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


async function getTransactionsForOrderId(serverAddress, orderId, limit = 20) {
  try {
    // 构建 API 请求 URL
    const url = `${process.env.TESTNET_TON_TRAN}?address=${serverAddress}&limit=${limit}&api_key=${process.env.TESTNET_API_KEY}`;

    // 打印 URL，方便调试
    console.log('请求 URL:', url);

    // 发送请求并等待响应
    const response = await fetch(url);
    const data = await response.json();

    // 如果请求失败，抛出错误
    if (!data.ok) throw new Error(data.error?.message || '无法获取交易记录');

    // 提取交易记录
    const transactions = data.result;

    // 过滤包含 orderId 的交易
    const filteredTransactions = transactions.filter(tx => {
      const inMsg = tx.in_msg || {};
      const message = inMsg.message || '';
      const payloadBytes = inMsg.payload_bytes;

      // 将 payload 字节流转换为字符串
      let payload = '';
      if (payloadBytes) {
        try {
          payload = Buffer.from(payloadBytes, 'base64').toString('utf-8');
        } catch (e) {
          payload = '';  // 如果解码失败，设置为空字符串
        }
      }

      console.log('Message:', tx.message);
      console.log('Payload:', payload);

      // 检查 message 或 payload 是否包含 orderId
      return message.includes(orderId) || payload.includes(orderId);
    });

    // 按时间戳排序（时间越近越前）
    filteredTransactions.sort((a, b) => b.utime - a.utime);

    // 提取交易哈希、金额和时间
    const transactionDetails = filteredTransactions.map(tx => ({
      hash: tx.transaction_id.hash,  // 交易哈希
      amount: TonWeb.utils.fromNano(tx.in_msg.value || '0'),  // 转账金额，转换为 TON
      time: new Date(tx.utime * 1000),  // 转账时间（转换为日期格式）
    }));

    return transactionDetails;
  } catch (err) {
    console.error('获取交易记录失败:', err);
    throw new Error('获取交易记录失败: ' + err.message);
  }
}


module.exports = {
  init,
  getAddress,
  getBalance,
  sendTon,
  isDeployed,
  deploy,
  checkBalanceDebug,
  sendTonHaveOrderId,
  sentClientTonHaveOrderId,
  getTransactionsForOrderId,
};
