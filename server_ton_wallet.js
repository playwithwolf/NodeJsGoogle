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

// function base64ToReversedHex(base64Hash) {
//   const buffer = Buffer.from(base64Hash, 'base64');
//   const reversed = Buffer.from(buffer).reverse();  // 反转字节顺序
//   return reversed.toString('hex');
// }

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

async function getFullTransactionData(txHash, address, lt) {
  const rpcUrl = process.env.TESTNET_TON_API; // e.g. https://testnet.toncenter.com/api/v2/jsonRPC
  const apiKey = process.env.TESTNET_API_KEY;  // 如果需要的话
  const toLt = (BigInt(lt) + 1n).toString();
  // 构造 JSON-RPC 请求体
  const body = {
    jsonrpc: '2.0',
    id: 1,
    method: 'getTransactions',
    params: {
      address,
      limit: 1,
     // to_lt: toLt,
      archival: true
    }
  };

  const url = apiKey ? `${rpcUrl}?api_key=${apiKey}` : rpcUrl;
  console.log('→ JSON-RPC URL:', url);
  console.log('→ Request body:', JSON.stringify(body));

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    console.log('→ Request json :', JSON.stringify(json));
    if (json.error) {
      throw new Error(`RPC Error ${json.error.code}: ${json.error.message}`);
    }
    const txList = Array.isArray(json.result) ? json.result : [];
    if (txList.length === 0) {
      console.warn('⚠️ 没有拿到任何交易，请检查 address/lt 是否正确');
      return null;
    }
    // 找到 hash 匹配的那笔
    const tx = txList.find(t => {
      const h = t.transaction_id?.hash;
      return h && (h.replace(/^0x/, '') === txHash.replace(/^0x/, ''));
    }) ?? txList[0];
    console.log('← Fetched tx:', {
      lt: tx.transaction_id.lt,
      hash: tx.transaction_id.hash,
      hasData: !!tx.data,
      hasInMsgBoc: !!(tx.in_msg && tx.in_msg.boc),
    });
    return tx;
  } catch (err) {
    console.error('❌ Failed to fetch transaction:', err.message);
    return null;
  }
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

    // 提取交易哈希、金额和时间
    const transactionDetails = filteredTransactions.map(tx => {
      
      const inMsg = tx.in_msg || {};
      const data = inMsg.msg_data ? inMsg.msg_data.body : '';
      const realHash = getRealTxHashFromDataBase64(tx.data)
      console.log("realHash = " +realHash)
      const result = getFullTransactionData(realHash,tx.address.account_address,tx.transaction_id.lt)
      console.log("fullresult = " +JSON.stringify(result))
      return {
        hash: tx.transaction_id.hash,
        realHash: realHash,
        amount: TonWeb.utils.fromNano(inMsg.value || '0'),
        time: new Date(tx.utime * 1000),
        from: inMsg.source || 'external',
        to: inMsg.destination || serverAddress,
      };
    });

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
