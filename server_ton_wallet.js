// server_wallet.js
require('dotenv').config();
const TonWeb = require('tonweb');
const tonMnemonic = require('tonweb-mnemonic');
const { v4: uuidv4 } = require('uuid');
const fetch = require('node-fetch');
const crypto = require('crypto');
const { Cell: TonWebCel } = TonWeb.boc;
const { Cell: CoreCell } = require('ton-core');

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

async function getAddressForWeb() {
  await init();
  const address = await wallet.getAddress();
  return address.toString({ bounceable: false, urlSafe: true }); // ✅ Tonkeeper 可识别
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


function decodePayloadBase64(base64Str) {
  try {
    const slice = TonWeb.boc.Cell.oneFromBoc(base64Str).beginParse();
    return slice.readString();
  } catch (e) {
    console.log("解码失败1 e = "+e)
    return '';
  }
}

 

function getRealTxHashFromDataBase64(base64Data) {
  try {
    const rootCell = CoreCell.fromBase64(base64Data); // 直接就是 Cell 对象，不是数组
    const hash = rootCell.hash(); // 计算哈希
    const hashHex = Buffer.from(hash).toString('hex');
    console.log('计算出的真实交易哈希:', hashHex);

    return hashHex;
  } catch (e) {
    console.warn('⚠️ 计算真实交易哈希失败:', e.message);
    return '';
  }
}

async function getFullTransactionData(address,hash) {
  
 const url = `${process.env.TESTNET_TON_TRAN}?address=${address}&limit=1&api_key=${process.env.TESTNET_API_KEY}&hash=${hash}`;
  try {

    // 打印 URL，方便调试
    console.log('请求 URL:', url);

    // 发送请求并等待响应
    const response = await fetch(url);
    const data = await response.json();

    // 如果请求失败，抛出错误
    if (!data.ok) throw new Error(data.error?.message || '无法获取交易记录');
    // 提取交易记录
    const transactions = data.result;
    hash = transactions[0].transaction_id.hash;
    console.log("hash = "+hash)
    
    return hash;
  } catch (err) {
    console.error('❌ Failed to fetch transaction:', err.message);
    return "";
  }
}

async function getTransactionsInOrderId(serverAddress, orderId, limit = 20) {
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
      const inMsg = tx.in_msg;
      if (!inMsg || !inMsg.value || inMsg.value === '0') return false;

      // 解析 payload 中的字符串
      let payload = '';
      try {
        const base64Body = inMsg.msg_data?.body || '';
        payload = parsePayloadFromBodyBase64(base64Body);  // 使用上面的函数
      } catch (e) {
        payload = '';
      }

      // message 解码（有时是 base64，有时是明文）
      let message = '';
      try {
        message = Buffer.from(inMsg.message || '', 'base64').toString('utf-8');
      } catch {
        message = inMsg.message || '';
      }

      // console.log('✔️ 解码后的 Message:', message);
      // console.log('✔️ 解码后的 Payload:', payload);

      return message.includes(orderId) || payload.includes(orderId);
    });

    // 按时间戳排序（时间越近越前）
    filteredTransactions.sort((a, b) => b.utime - a.utime);
 
    const transactionDetails = await Promise.all(filteredTransactions.map(async (tx) => {
      const inMsg = tx.in_msg || {};
      const data = inMsg.msg_data ? inMsg.msg_data.body : '';
      const realHash = getRealTxHashFromDataBase64(tx.data);
      console.log("realHash = " + realHash);

      const sourcehash = await getFullTransactionData(inMsg.source, realHash);
      console.log("sourcehash = " + sourcehash);

      const buf = Buffer.from(sourcehash, 'base64');
      const traceIdHex = buf.toString('hex');
      console.log("traceIdHex = " + traceIdHex);

      return {
        hash: tx.transaction_id.hash,
        realHex: realHash,
        sourcehash: sourcehash,
        traceIdHex: traceIdHex,
        amount: TonWeb.utils.fromNano(inMsg.value || '0'),
        time: new Date(tx.utime * 1000),
        from: inMsg.source || 'external',
        to: inMsg.destination || serverAddress,
      };
    }));

    return transactionDetails;
  } catch (err) {
    console.error('获取交易记录失败:', err);
    throw new Error('获取交易记录失败: ' + err.message);
  }
}



async function getTransactionsOutOrderId(serverAddress, orderId, limit = 20) {
  try {
    const url = `${process.env.TESTNET_TON_TRAN}?address=${serverAddress}&limit=${limit}&api_key=${process.env.TESTNET_API_KEY}`;
    console.log('请求 URL:', url);

    const response = await fetch(url);
    const data = await response.json();

    if (!data.ok) throw new Error(data.error?.message || '无法获取交易记录');

    const transactions = data.result;

    const filteredTransactions = [];

    for (const tx of transactions) {
      if (!tx.out_msgs || tx.out_msgs.length === 0) continue;

      // 先拿 realHex，从交易整体 data 解析
      const realHash = getRealTxHashFromDataBase64(tx.data);

      for (const outMsg of tx.out_msgs) {
        if (!outMsg.value || outMsg.value === '0') continue;

        let payload = '';
        try {
          const base64Body = outMsg.msg_data?.body || '';
          payload = parsePayloadFromBodyBase64(base64Body);
        } catch {
          payload = '';
        }

        let message = '';
        try {
          message = Buffer.from(outMsg.message || '', 'base64').toString('utf-8');
        } catch {
          message = outMsg.message || '';
        }

        if (message.includes(orderId) || payload.includes(orderId)) {
          filteredTransactions.push({
            hash: tx.transaction_id.hash,
            realHex: realHash,
            amount: TonWeb.utils.fromNano(outMsg.value || '0'),
            time: new Date(tx.utime * 1000),
            from: outMsg.source || serverAddress,
            to: outMsg.destination || 'external',
          });
        }
      }
    }

    filteredTransactions.sort((a, b) => b.time - a.time);

    return filteredTransactions;
  } catch (err) {
    console.error('获取出站交易记录失败:', err);
    throw new Error('获取出站交易记录失败: ' + err.message);
  }
}

function isAmountMatch(userInputStr, chainValueNanoTON, tolerance = 1e-9) {
  const chainAmount = parseFloat(TonWeb.utils.fromNano(chainValueNanoTON)); // 确保用 fromNano 转换
  const userAmount = parseFloat(userInputStr);

  const diff = Math.abs(chainAmount - userAmount);
  console.log(`chain: ${chainAmount}, user: ${userAmount}, diff: ${diff}`);
  
  return diff <= tolerance;
}

async function getTransactionsInHash(serverAddress,amount, client_hash, time,timezoneOffset) {
  try {
    // 构建 API 请求 URL
    const url = `${process.env.TESTNET_TON_TRAN}?address=${serverAddress}&limit=1&api_key=${process.env.TESTNET_API_KEY}&hash=${client_hash}`;

    // 打印 URL，方便调试
    console.log('请求 URL:', url);

    // 发送请求并等待响应
    const response = await fetch(url);
    const data = await response.json();
    console.log(JSON.stringify(data))

    // 如果请求失败，抛出错误
    if (!data.ok) throw new Error(data.error?.message || '无法获取交易记录');

    // 提取交易记录
    const transactions = data.result;
    const utime = transactions[0].utime;
    
    const iscurrectTime = isUtimeCloseToTarget(utime,time,timezoneOffset)
    const inMsg = transactions[0].in_msg;
    const inValueNano = inMsg?.value; // 例如：'200000000'
    console.log("inValueNano = "+inValueNano)
    console.log("utime = "+utime)
    console.log("time = "+time)
  
    console.log("iscurrectTime = "+iscurrectTime)
    const isamountok = isAmountMatch(amount, inValueNano);
    console.log("isamountok = "+isamountok)
    
    return {   
            amount: TonWeb.utils.fromNano(String(inValueNano)),
            isOK: iscurrectTime && isamountok
          };
  } catch (err) {
    console.error('获取交易记录失败:', err);
    throw new Error('获取交易记录失败: ' + err.message);
  }
}


/**
 * 判断交易的 utime 是否与目标时间相差不超过指定秒数
 * @param {number} utime 交易时间戳，单位秒
 * @param {string} targetTimeStr 目标时间字符串，格式 "YYYY/MM/DD HH:mm:ss"
 * @param {number} toleranceSeconds 允许误差秒数，默认60秒
 * @returns {boolean} 是否在误差范围内
 */
function isUtimeCloseToTarget(utime, targetTimeStr, timezoneOffset, toleranceSeconds = 60) {
  // 兼容 "2025/5/14 19:38:49" -> "2025-05-14T19:38:49"
 const isoTimeStr = targetTimeStr
    .replace(/\//g, '-') // 替换 / 为 -
    .replace(/(\d{4})-(\d{1,2})-(\d{1,2})/, (_, y, m, d) => {
      return `${y}-${m.padStart?.(2, '0') || ('0' + m).slice(-2)}-${d.padStart?.(2, '0') || ('0' + d).slice(-2)}`;
    })
    .replace(' ', 'T') + timezoneOffset;
                         // 替换空格为 T，使其更像 ISO
  console.log(" isoTimeStr = "+isoTimeStr)
  const targetTime = new Date(isoTimeStr);
  console.log(" targetTime = "+targetTime)
  const targetTs = Math.floor(targetTime.getTime() / 1000);
  console.log(" targetTs = "+targetTs)

  console.log(" abs = "+Math.abs(utime - targetTs))

  return Math.abs(utime - targetTs) <= toleranceSeconds;
}


// async function getFullTransactionData(address,hash) {
  
//  const url = `${process.env.TESTNET_TON_TRAN}?address=${address}&limit=1&api_key=${process.env.TESTNET_API_KEY}&hash=${hash}`;
//   try {

//     // 打印 URL，方便调试
//     console.log('请求 URL:', url);

//     // 发送请求并等待响应
//     const response = await fetch(url);
//     const data = await response.json();

//     // 如果请求失败，抛出错误
//     if (!data.ok) throw new Error(data.error?.message || '无法获取交易记录');
//     // 提取交易记录
//     const transactions = data.result;
//     hash = transactions[0].transaction_id.hash;
//     console.log("hash = "+hash)
    
//     return hash;
//   } catch (err) {
//     console.error('❌ Failed to fetch transaction:', err.message);
//     return "";
//   }
// }

function hexToBytes(hex) {
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error("Invalid hex publicKey");
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 64; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

function buildTonPaymentLink(toAddress, amountTON, orderId) {
  const text = encodeURIComponent(`${orderId}`);
  return `ton://transfer/${toAddress}?amount=${amountTON}&text=${text}`;
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
  getTransactionsInOrderId,
  getTransactionsOutOrderId,
  getTransactionsInHash,
  hexToBytes,
  buildTonPaymentLink,
  getAddressForWeb,
};
