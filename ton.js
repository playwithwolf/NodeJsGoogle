const express = require('express');
const crypto = require('crypto');
const url = require('url');
const router = express.Router();
const querystring = require('querystring');
const tonMnemonic = require('tonweb-mnemonic');
const TonWeb = require('tonweb');
require('dotenv').config();
const tonweb = new TonWeb(new TonWeb.HttpProvider(process.env.TESTNET_TON_API,{
    apiKey: process.env.TESTNET_API_KEY
  }));

const { sendTon , sendTonHaveOrderId, getAddress, sentClientTonHaveOrderId , getTransactionsInOrderId, getTransactionsOutOrderId, getTransactionsInHash } =  require('./server_ton_wallet');
const WalletClass = tonweb.wallet.all.v3R2;


const check_server_ton_wallet = require('./check_server_ton_wallet');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

router.post('/createTonWallet', async (req, res) => {
  try {
    // 1. 生成助记词 & 密钥对
    const mnemonics = await tonMnemonic.generateMnemonic();
    const isValid = await tonMnemonic.validateMnemonic(mnemonics);
    if (!isValid) {
      return res.status(400).json({ error: '生成的助记词无效' });
    }

    const keyPair = await tonMnemonic.mnemonicToKeyPair(mnemonics);
    const WalletClass = tonweb.wallet.all.v3R2;

    const userWallet = new WalletClass(tonweb.provider, {
      publicKey: keyPair.publicKey,
      wc: 0,
    });

    const address = await userWallet.getAddress();
    const addressStr = address.toString(true, false, false);
    console.log('[系统] 用户钱包地址:', addressStr);


    await delay(1000);
    // 5. 向地址转入启动资金（0.05 TON）
    await sendTon(address, 0.1);
    console.log('[系统] 已向用户地址转入 0.1 TON:', addressStr);

    await delay(1000);
    // 6. 轮询到账
    let isFunded = false;
    for (let i = 0; i < 10; i++) {
      const info = await tonweb.provider.getAddressInfo(addressStr);
      const balanceNano = BigInt(info.balance || 0n);
      console.log(`[系统] 第 ${i + 1} 次轮询，余额: ${balanceNano} nanoTON`);
      if (balanceNano >= BigInt(TonWeb.utils.toNano('0.05'))) {
        isFunded = true;
        break;
      }
      await new Promise(r => setTimeout(r, 5000)); // 每次等待 5 秒
    }

    if (!isFunded) {
      return res.status(500).json({ error: '转账未到账，钱包部署失败，请稍后重试' });
    }

    await delay(1000);

    // 2. 检查钱包是否已激活
    const walletState = await tonweb.provider.getAddressInfo(addressStr);
    console.log('[系统] 用户钱包地址状态:', walletState.state);

    if (walletState.state !== 'uninitialized') {
      return res.status(400).json({ error: '钱包状态不适合部署，请检查钱包状态' });
    }

    await delay(1000);
    // 3. 部署钱包（激活钱包）
    let deployTx;
    try {
      deployTx = await userWallet.deploy(keyPair.secretKey);
      console.log('[系统] 开始部署钱包');
      
      // 添加重试机制，确保部署交易成功
      for (let i = 0; i < 5; i++) {
        try {
          await deployTx.send();
          console.log('[系统] 钱包部署交易已发送');
          break; // 成功发送则退出循环
        } catch (error) {
          console.error('[系统] 部署钱包失败，重试中:', error);
          if (i === 4) {
            throw new Error('钱包部署失败，请稍后重试');
          }
          await new Promise(r => setTimeout(r, 5000)); // 等待 5 秒后重试
        }
      }
    } catch (error) {
      console.error('[系统] 部署钱包失败:', error);
      return res.status(500).json({ error: '钱包部署失败，请稍后重试' });
    }

    await delay(1000);
    // 4. 等待钱包部署完成（钱包状态变为 active）
    let isDeployed = false;
    for (let i = 0; i < 5; i++) {
      const walletState = await tonweb.provider.getAddressInfo(addressStr);
      console.log('[系统] 钱包状态:', walletState.state);

      if (walletState.state === 'active') {
        isDeployed = true;
        break;
      }
      await new Promise(r => setTimeout(r, 3000)); // 等待 3 秒
    }

    if (!isDeployed) {
      return res.status(500).json({ error: '钱包部署失败，请稍后重试' });
    }

    

    // 返回钱包信息
    res.status(200).json({
      mnemonics,
      bounceableAddress: address.toString(true, true, true),
      nonBounceableAddress: address.toString(true, true, false),
      rawAddress: address.toString(false, false, false),
      publicKey: Buffer.from(keyPair.publicKey).toString('hex'),
      secretKey: Buffer.from(keyPair.secretKey).toString('hex'),
      walletVersion: 'v3R2',
    });
  } catch (error) {
    console.error('创建钱包失败:', error);
    res.status(500).json({ error: '创建钱包失败', details: error.message });
  }
});




router.post('/getTonBalance', async (req, res) => {

try {
    const { address } = req.body;

    if (!address) {
      return res.status(400).json({ error: '地址不能为空' });
    }

    // 创建 Address 实例
    const tonAddress = new TonWeb.utils.Address(address);

    // 获取余额（单位为 nanoTON）
    const balanceNano = await tonweb.getBalance(tonAddress);

    // 将 nanoTON 转换为 TON
    const balanceTON = TonWeb.utils.fromNano(balanceNano);

    res.status(200).json({
      address: tonAddress.toString(true, true, true),
      balanceTON,
      balanceNano: balanceNano.toString(),
    });
  } catch (error) {
    console.error('查询余额失败:', error);
    res.status(500).json({ error: '查询余额失败' });
  }

});


router.post('/serverSendTon', async (req, res) => {

try {
    const { orderId , mnemonics , amountTON } = req.body;
 
    if (!orderId || !mnemonics || !amountTON) {
      return res.status(400).json({
        error: '参数缺失',
        success: false,
        orderId, mnemonics, amountTON
      });
    }

    console.log(`1`);
    const keyPair = await tonMnemonic.mnemonicToKeyPair(mnemonics);
    console.log(`2`);
    const WalletClass = tonweb.wallet.all.v3R2;
    const userWallet = new WalletClass(tonweb.provider, {
      publicKey: keyPair.publicKey,
      wc: 0,
    });
     console.log(`3`);
     const useraddress = await userWallet.getAddress();
     console.log(`4`);
     const toAddressStr = new TonWeb.utils.Address(useraddress).toString(true, true, false);
     //获得目标钱包初始余额
     const initInfo = await tonweb.provider.getAddressInfo(toAddressStr);
     const initBalanceNano = BigInt(initInfo.balance || 0n);


     // 获取服务器钱包
    const server_address = await getAddress();
    const server_addressStr = new TonWeb.utils.Address(server_address).toString(true, true, false);

    // 获取服务器初始余额
     const info = await tonweb.provider.getAddressInfo(server_addressStr);
     const serverBalanceNano = BigInt(info.balance || 0n);

     const transferAmountNano = BigInt(TonWeb.utils.toNano(amountTON.toString()));
     const estimatedFeeNano = BigInt(TonWeb.utils.toNano('0.03'));  // 假设手续费为 0.03 TON

     const requiredBalanceNano = transferAmountNano + estimatedFeeNano;

     // 判断余额是否足够
     if (serverBalanceNano < requiredBalanceNano) {
        const currentBalanceTON = TonWeb.utils.fromNano(serverBalanceNano.toString());
        const requiredBalanceTON = TonWeb.utils.fromNano(requiredBalanceNano.toString());

        console.log(`[系统] 服务器钱包余额不足，无法完成转账（余额：${currentBalanceTON} TON，所需：${requiredBalanceTON} TON）`);

        return res.status(400).json({
          error: '服务器钱包余额不足，无法完成转账',
          success: false,
          currentBalance: currentBalanceTON,
          requiredBalance: requiredBalanceTON
        });
     }


    await sendTonHaveOrderId(useraddress, amountTON,orderId);
    console.log(`[系统] 已向用户地址转入 ${amountTON} TON: ${toAddressStr}  orderId:${orderId}`);

    await delay(1000);
    const expectAmountNano = BigInt(TonWeb.utils.toNano(amountTON.toString()));
    const toleranceNano = BigInt(TonWeb.utils.toNano('0.001')); // 容差 0.001 TON

    // 轮询到账
    let isFunded = false;
    for (let i = 0; i < 10; i++) {
      const info = await tonweb.provider.getAddressInfo(toAddressStr);
      const balanceNano = BigInt(info.balance || 0n);
      const delta = balanceNano - initBalanceNano;

      console.log(`[系统] 第 ${i + 1} 次轮询，余额: ${balanceNano}，增加: ${delta} nanoTON`);

      if (delta + toleranceNano >= expectAmountNano) {
        isFunded = true;
        break;
      }

      await new Promise(r => setTimeout(r, 5000)); // 每次等待 5 秒
    }


    if (!isFunded) {
      return res.status(500).json({ 
        error: '转账未到账，请稍后重试', 
        success: false,
        orderId: orderId,
        mnemonics: mnemonics,
        amountTON: amountTON,
      });
    }


     res.status(200).json({
      success: true,
      orderId: orderId,
      mnemonics: mnemonics,
      amountTON: amountTON,
   
    });
  } catch (error) {
     console.error('[serverSendTon] 发生错误:', error);
     res.status(500).json({ 
      error: error.message || String(error),
      success: false,
      // orderId: orderId,
      // mnemonics: mnemonics,
      // amountTON: amountTON,

     });
  }

});



router.post('/serverSendTonByAddress', async (req, res) => {

try {
    const { orderId , userAddress , amountTON } = req.body;
 
    if (!orderId || !userAddress || !amountTON) {
      return res.status(400).json({
        error: '参数缺失',
        success: false,
        orderId, userAddress, amountTON
      });
    }

    // console.log(`1`);
    // const keyPair = await tonMnemonic.mnemonicToKeyPair(mnemonics);
    // console.log(`2`);
    // const WalletClass = tonweb.wallet.all.v3R2;
    // const userWallet = new WalletClass(tonweb.provider, {
    //   publicKey: keyPair.publicKey,
    //   wc: 0,
    // });
    //  console.log(`3`);
    //  const useraddress = await userWallet.getAddress();
    //  console.log(`4`);
     const toAddressStr = new TonWeb.utils.Address(userAddress).toString(true, true, false);
     //获得目标钱包初始余额
     const initInfo = await tonweb.provider.getAddressInfo(toAddressStr);
     const initBalanceNano = BigInt(initInfo.balance || 0n);


     // 获取服务器钱包
    const server_address = await getAddress();
    const server_addressStr = new TonWeb.utils.Address(server_address).toString(true, true, false);

    // 获取服务器初始余额
     const info = await tonweb.provider.getAddressInfo(server_addressStr);
     const serverBalanceNano = BigInt(info.balance || 0n);

     const transferAmountNano = BigInt(TonWeb.utils.toNano(amountTON.toString()));
     const estimatedFeeNano = BigInt(TonWeb.utils.toNano('0.03'));  // 假设手续费为 0.03 TON

     const requiredBalanceNano = transferAmountNano + estimatedFeeNano;

     // 判断余额是否足够
     if (serverBalanceNano < requiredBalanceNano) {
        const currentBalanceTON = TonWeb.utils.fromNano(serverBalanceNano.toString());
        const requiredBalanceTON = TonWeb.utils.fromNano(requiredBalanceNano.toString());

        console.log(`[系统] 服务器钱包余额不足，无法完成转账（余额：${currentBalanceTON} TON，所需：${requiredBalanceTON} TON）`);

        return res.status(400).json({
          error: '服务器钱包余额不足，无法完成转账',
          success: false,
          currentBalance: currentBalanceTON,
          requiredBalance: requiredBalanceTON
        });
     }


    await sendTonHaveOrderId(userAddress, amountTON,orderId);
    console.log(`[系统] 已向用户地址转入 ${amountTON} TON: ${toAddressStr}  orderId:${orderId}`);

    await delay(1000);
    const expectAmountNano = BigInt(TonWeb.utils.toNano(amountTON.toString()));
    const toleranceNano = BigInt(TonWeb.utils.toNano('0.001')); // 容差 0.001 TON

    // 轮询到账
    let isFunded = false;
    for (let i = 0; i < 10; i++) {
      const info = await tonweb.provider.getAddressInfo(toAddressStr);
      const balanceNano = BigInt(info.balance || 0n);
      const delta = balanceNano - initBalanceNano;

      console.log(`[系统] 第 ${i + 1} 次轮询，余额: ${balanceNano}，增加: ${delta} nanoTON`);

      if (delta + toleranceNano >= expectAmountNano) {
        isFunded = true;
        break;
      }

      await new Promise(r => setTimeout(r, 5000)); // 每次等待 5 秒
    }


    if (!isFunded) {
      return res.status(500).json({ 
        error: '转账未到账，请稍后重试', 
        success: false,
        orderId: orderId,
        userAddress: userAddress,
        amountTON: amountTON,
      });
    }


     res.status(200).json({
      success: true,
      orderId: orderId,
      userAddress: userAddress,
      amountTON: amountTON,
   
    });
  } catch (error) {
     console.error('[serverSendTon] 发生错误:', error);
     res.status(500).json({ 
      error: error.message || String(error),
      success: false,
      // orderId: orderId,
      // mnemonics: mnemonics,
      // amountTON: amountTON,

     });
  }

});


router.post('/sendTonToServer', async (req, res) => {
  try {
    const { orderId, mnemonics, amountTON } = req.body;

    if (!orderId || !mnemonics || !amountTON) {
      return res.status(400).json({
        error: '参数缺失',
        success: false,
        orderId, mnemonics, amountTON
      });
    }

    const keyPair = await tonMnemonic.mnemonicToKeyPair(mnemonics);

    const WalletClass = tonweb.wallet.all.v3R2;
    const client_wallet = new WalletClass(tonweb.provider, {
      publicKey: keyPair.publicKey,
      wc: 0
    });

    const client_address = await client_wallet.getAddress();
    const clientAddressStr = new TonWeb.utils.Address(client_address).toString(true, true, false);

    const clientInfo = await tonweb.provider.getAddressInfo(clientAddressStr);
    const clientBalance = BigInt(clientInfo.balance || 0n);

    console.log('[debug] amountTON 类型:', typeof amountTON, amountTON);

    // 转账金额和手续费统一使用 BigInt
    const transferAmount = BigInt(TonWeb.utils.toNano(amountTON.toString()));
    console.log('[debug] transferAmount:', transferAmount.toString());

    const estimatedFee = BigInt(TonWeb.utils.toNano('0.03'));  // 保守估计手续费为 0.03 TON
    const totalRequired = transferAmount + estimatedFee;

    if (clientBalance < totalRequired) {
      return res.status(400).json({
        error: '钱包余额不足，无法完成转账（需包含手续费）',
        success: false,
        clientAddress: clientAddressStr,
        currentBalanceTON: TonWeb.utils.fromNano(clientBalance),
        requiredTON: TonWeb.utils.fromNano(totalRequired)
      });
    }

    const server_address = await getAddress();
    const server_addressStr = new TonWeb.utils.Address(server_address).toString(true, true, false);

    // 获取服务器初始余额
    const initInfo = await tonweb.provider.getAddressInfo(server_addressStr);
    const initBalanceNano = BigInt(initInfo.balance || 0n);

    // 发起转账
    await sentClientTonHaveOrderId(client_wallet, amountTON, orderId, keyPair);
    console.log(`[系统] 用户[${clientAddressStr}] 已向服务器地址[${server_addressStr}] 转入 ${amountTON} TON`);

    // 轮询到账
    const expectAmountNano = BigInt(TonWeb.utils.toNano(amountTON.toString()));
    const tolerance = BigInt(TonWeb.utils.toNano('0.001'));  // 允许 0.001 TON 容差
    let isFunded = false;

    for (let i = 0; i < 10; i++) {
      const info = await tonweb.provider.getAddressInfo(server_addressStr);
      const balanceNano = BigInt(info.balance || 0n);
      const delta = balanceNano - initBalanceNano;

      console.log(`[系统] 第 ${i + 1} 次轮询，余额: ${balanceNano}，增加: ${delta} nanoTON`);

      if (delta >= expectAmountNano - tolerance) {
        isFunded = true;
        break;
      }

      await new Promise(r => setTimeout(r, 5000));
    }


    if (!isFunded) {
      return res.status(500).json({
        error: '转账未到账，请稍后重试',
        success: false,
        orderId, mnemonics, amountTON
      });
    }

    res.status(200).json({
      success: true,
      orderId,
      amountTON,
      mnemonics: mnemonics
    });
  } catch (error) {
    console.error('[serverSendTon] 发生错误:', error);
    res.status(500).json({
      error: error.message || String(error),
      success: false
    });
  }
});


router.post('/sendTonToServerByPublicKey', async (req, res) => {
  try {
    const { orderId, publicKey, amountTON } = req.body;

    if (!orderId || !publicKey || !amountTON  || !publicKey) {
      return res.status(400).json({
        error: '参数缺失',
        success: false,
        orderId,  amountTON, publicKey
      });
    }
    
    const WalletClass = tonweb.wallet.all.v3R2;
    const client_wallet = new WalletClass(tonweb.provider, {
      publicKey: publicKey,
      wc: 0
    });

    const client_address = await client_wallet.getAddress();
    const clientAddressStr = new TonWeb.utils.Address(client_address).toString(true, true, false);

    const clientInfo = await tonweb.provider.getAddressInfo(clientAddressStr);
    const clientBalance = BigInt(clientInfo.balance || 0n);

    console.log('[debug] amountTON 类型:', typeof amountTON, amountTON);

    // 转账金额和手续费统一使用 BigInt
    const transferAmount = BigInt(TonWeb.utils.toNano(amountTON.toString()));
    console.log('[debug] transferAmount:', transferAmount.toString());

    const estimatedFee = BigInt(TonWeb.utils.toNano('0.03'));  // 保守估计手续费为 0.03 TON
    const totalRequired = transferAmount + estimatedFee;

    if (clientBalance < totalRequired) {
      return res.status(400).json({
        error: '钱包余额不足，无法完成转账（需包含手续费）',
        success: false,
        clientAddress: clientAddressStr,
        currentBalanceTON: TonWeb.utils.fromNano(clientBalance),
        requiredTON: TonWeb.utils.fromNano(totalRequired)
      });
    }

    const server_address = await getAddress();
    const server_addressStr = new TonWeb.utils.Address(server_address).toString(true, true, false);

    // 获取服务器初始余额
    const initInfo = await tonweb.provider.getAddressInfo(server_addressStr);
    const initBalanceNano = BigInt(initInfo.balance || 0n);

    // 发起转账
    await sentClientTonHaveOrderId(client_wallet, amountTON, orderId, keyPair);
    console.log(`[系统] 用户[${clientAddressStr}] 已向服务器地址[${server_addressStr}] 转入 ${amountTON} TON`);

    // 轮询到账
    const expectAmountNano = BigInt(TonWeb.utils.toNano(amountTON.toString()));
    const tolerance = BigInt(TonWeb.utils.toNano('0.001'));  // 允许 0.001 TON 容差
    let isFunded = false;

    for (let i = 0; i < 10; i++) {
      const info = await tonweb.provider.getAddressInfo(server_addressStr);
      const balanceNano = BigInt(info.balance || 0n);
      const delta = balanceNano - initBalanceNano;

      console.log(`[系统] 第 ${i + 1} 次轮询，余额: ${balanceNano}，增加: ${delta} nanoTON`);

      if (delta >= expectAmountNano - tolerance) {
        isFunded = true;
        break;
      }

      await new Promise(r => setTimeout(r, 5000));
    }


    if (!isFunded) {
      return res.status(500).json({
        error: '转账未到账，请稍后重试',
        success: false,
        orderId, publicKey, amountTON
      });
    }

    res.status(200).json({
      success: true,
      orderId,
      amountTON,
      publicKey
    });
  } catch (error) {
    console.error('[serverSendTon] 发生错误:', error);
    res.status(500).json({
      error: error.message || String(error),
      success: false
    });
  }
});

router.post('/getTransactionsInOrderId', async (req, res) => {
  try {
    const { orderId } = req.body;


    if (!orderId) {
      return res.status(400).json({
        error: 'orderId不能为空',
        success: false
      });
    }

    const server_address = await getAddress();
    const server_addressStr = new TonWeb.utils.Address(server_address).toString(true, true, false);

    const transactions = await getTransactionsInOrderId(server_addressStr, orderId);

    return res.status(200).json({
      success: true,
      transactions
    });
  } catch (error) {
    console.error('[getTransactionsForOrderId] 发生错误:', error);
    return res.status(500).json({
      error: error.message || String(error),
      success: false
    });
  }
});

router.post('/getTransactionsOutOrderId', async (req, res) => {
  try {
    const { orderId } = req.body;


    if (!orderId) {
      return res.status(400).json({
        error: 'orderId不能为空',
        success: false
      });
    }

    const server_address = await getAddress();
    const server_addressStr = new TonWeb.utils.Address(server_address).toString(true, true, false);

    const transactions = await getTransactionsOutOrderId(server_addressStr, orderId);

    return res.status(200).json({
      success: true,
      transactions
    });
  } catch (error) {
    console.error('[getTransactionsForOrderId] 发生错误:', error);
    return res.status(500).json({
      error: error.message || String(error),
      success: false
    });
  }
});


router.post('/getTransactionsInHash', async (req, res) => {
  try {
    const { hash , amount, time ,timezoneOffset } = req.body;


    if (!hash || !amount || !time || !timezoneOffset) {
      return res.status(400).json({
        error: '参数缺失',
        success: false,
        orderId, mnemonics, amountTON
      });
    }

    const server_address = await getAddress();
    const server_addressStr = new TonWeb.utils.Address(server_address).toString(true, true, false);

    const transactions = await getTransactionsInHash(server_addressStr, amount,hash,time ,timezoneOffset);

    return res.status(200).json({
      success: true,
      transactions
    });
  } catch (error) {
    console.error('[getTransactionsForOrderId] 发生错误:', error);
    return res.status(500).json({
      error: error.message || String(error),
      success: false
    });
  }
});

// router.post('/prepare-transfer', async (req, res) => {
//   try {
//     const { fromPublicKey, toAddress, amount } = req.body;

//     if (!fromPublicKey || !toAddress || !amount) {
//       return res.status(400).json({ error: '缺少必要的参数' });
//     }

//     // 创建钱包实例
//     const WalletClass = tonweb.wallet.all.v3R2;
//     const wallet = new WalletClass(tonweb.provider, {
//       publicKey: Buffer.from(fromPublicKey, 'hex'),
//       wc: 0,
//     });

//     // 获取钱包地址和 seqno
//     const fromAddress = await wallet.getAddress();
//     const seqno = await wallet.methods.seqno().call();

//     // 构建转账消息
//     const transfer = await wallet.methods.transfer({
//       secretKey: Buffer.alloc(64), // 占位符，实际签名在客户端完成
//       toAddress,
//       amount: TonWeb.utils.toNano(amount),
//       seqno,
//       sendMode: 3,
//     });

//     // 获取未签名的 BOC
//     const boc = await transfer.getBoc(false);

//     res.status(200).json({
//       fromAddress: fromAddress.toString(true, true, true),
//       toAddress,
//       amount,
//       seqno,
//       boc: boc.toString('base64'),
//     });
//   } catch (error) {
//     console.error('构建转账请求失败:', error);
//     res.status(500).json({ error: '构建转账请求失败' });
//   }
// });

// // 定义路由，接收已签名的 BOC 并广播
// router.post('/broadcast', async (req, res) => {
//   try {
//     const { signedBocBase64 } = req.body;

//     if (!signedBocBase64) {
//       return res.status(400).json({ error: '缺少 signedBocBase64 参数' });
//     }

//     // 将 Base64 编码的 BOC 转换为字节数组
//     const bocBytes = Buffer.from(signedBocBase64, 'base64');

//     // 使用 TonWeb 将 BOC 发送到区块链
//     await tonweb.provider.sendBoc(bocBytes);

//     res.status(200).json({ message: '交易已成功广播到区块链' });
//   } catch (error) {
//     console.error('广播交易失败:', error);
//     res.status(500).json({ error: '广播交易失败' });
//   }
// });



module.exports = router;