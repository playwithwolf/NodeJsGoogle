const express = require('express');
const crypto = require('crypto');
const url = require('url');
const router = express.Router();
const querystring = require('querystring');
const tonMnemonic = require('tonweb-mnemonic');
const TonWeb = require('tonweb');
const QRCode = require('qrcode');
const { Address } = require('@ton/core');
require('dotenv').config();
const tonweb = new TonWeb(new TonWeb.HttpProvider(process.env.TESTNET_TON_API,{
    apiKey: process.env.TESTNET_API_KEY
  }));

const { sendTon , sendTonHaveOrderId, getAddress, sentClientTonHaveOrderId , getTransactionsInOrderId, getTransactionsOutOrderId, getTransactionsInHash , hexToBytes ,buildTonPaymentLink,getAddressForWeb,buildTonPaymentTonhubLink,buildTonPaymentTonkeeperLink,getAddressForWebByMnemonics,sentClientTonToAdressHaveOrderId} =  require('./server_ton_wallet');
const WalletClass = tonweb.wallet.all.v3R2;


const check_server_ton_wallet = require('./check_server_ton_wallet');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

router.post('/createTonWallet', async (req, res) => {  //创建一个可以控制的新的可以被链子上激活的 钱包
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




router.post('/getTonBalance', async (req, res) => {   //获得余额

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


router.post('/serverSendTon', async (req, res) => {      //从服务器给传递的地址转账 参数是目标钱包的助记词

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



router.post('/serverSendTonByAddress', async (req, res) => {  //从服务器给传递的地址转账 参数是目标地址

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


router.post('/sendTonToServer', async (req, res) => {   //使用服务器生成钱包做转账的
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

router.post('/createTonPaymentLink', async (req, res) => {  //生成支付 二维码  

   const { orderId, amountTON } = req.body;

    if (!orderId  || !amountTON) {
      return res.status(400).json({
        error: '参数缺失',
        success: false,
        orderId, amountTON
      });
    }
  const server_address = await getAddressForWeb();
  // const toAddress = new TonWeb.utils.Address(server_address).toString(true, true, false);
  //const toAddress = Address.parse(server_address).toString({ urlSafe: true, bounceable: false });
  console.log("server_address = "+server_address)
  const amountNano = BigInt(Math.floor(parseFloat(amountTON) * 1e9));
  console.log("amountNano = "+amountNano)
  const tonLink = buildTonPaymentLink(server_address, amountNano, orderId);
  const tonhublink = buildTonPaymentTonhubLink(server_address, amountNano, orderId);
  const Tonkeeperlink = buildTonPaymentTonkeeperLink(server_address, amountNano, orderId);
  console.log("tonLink = "+tonLink)
  QRCode.toDataURL(tonLink, (err, url) => {
    if (!err) {
      // 展示 base64 图像
          res.status(200).json({
            success: true,
            url,
            tonhublink,
            Tonkeeperlink
          });
    }else{
        res.status(500).json({
          error: error.message || String(error),
          success: false
        });
    } 
  });

});

router.post('/checkTonPaymentLink', async (req, res) => {     //对于 二维码 验证
  try {
    const { orderId, expectedTON } = req.body;

    if (!orderId || !expectedTON) {
      return res.status(400).json({ success: false, error: '参数缺失', orderId, expectedTON });
    }

    
     const server_address = await getAddress();
    const server_addressStr = new TonWeb.utils.Address(server_address).toString(true, true, false);

    const txList = await getTransactionsInOrderId(server_addressStr, orderId);


    const expectedNano = TonWeb.utils.toNano(expectedTON.toString());
    console.log('[CHECK] Expecting >=', expectedNano.toString(), 'nano TON');

    for (const tx of txList) {
       
      const amountNano = BigInt(TonWeb.utils.toNano(tx.amount)); // 0.2 -> 200000000n
      const expectedNano = BigInt(TonWeb.utils.toNano(expectedTON)); // 0.4 -> 400000000n


      if (amountNano >= expectedNano)  {
        return res.json({ success: true, paid: true });
      }
    }

    return res.json({ success: true, paid: false });

  } catch (error) {
    console.error('[ERROR] 查询交易出错:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || String(error)
    });
  }
});

router.post('/getTransactionsInOrderId', async (req, res) => {  //通过订单号查询服务器转入 成功和信息
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

router.post('/getTransactionsOutOrderId', async (req, res) => {  //通过订单号查询服务器转出 成功和信息
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


router.post('/getTransactionsInHash', async (req, res) => {  //通过网站上显示的 trace ID的 hash 查询服务器转入 成功和信息
  try {
    const { hash , amount, time ,timezoneOffset } = req.body;


    if (!hash || !amount || !time || !timezoneOffset) {   //timezoneOffset "+08:00"
      return res.status(400).json({
        error: '参数缺失',
        success: false,
        hash , amount, time ,timezoneOffset
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




router.post('/AppTonSendTonByAddress', async (req, res) => {      //从APP下带有助记词的钱包给传递的地址转账 参数是目标钱包的助记词

try {
    const { orderId , mnemonics , amountTON, toAddress } = req.body;
 
    if (!orderId || !mnemonics || !amountTON || !toAddress) {
      return res.status(400).json({
        error: '参数缺失',
        success: false,
        orderId, mnemonics, amountTON, toAddress
      });
    }

    console.log(`1`);
    // const keyPair = await tonMnemonic.mnemonicToKeyPair(mnemonics);
    // console.log(`2`);
    // const WalletClass = tonweb.wallet.all.v3R2;
    // const userWallet = new WalletClass(tonweb.provider, {
    //   publicKey: keyPair.publicKey,
    //   wc: 0,
    // });
    //  console.log(`3`);
    //  const fromuseraddress = await userWallet.getAddress();
    //  console.log(`4`);
     const toAddressStr = new TonWeb.utils.Address(toAddress).toString(true, true, false);
     //获得目标钱包初始余额
     const initInfo = await tonweb.provider.getAddressInfo(toAddressStr);
     const initBalanceNano = BigInt(initInfo.balance || 0n);


     // 获取APP钱包
    console.log(`1`);
    const keyPair = await tonMnemonic.mnemonicToKeyPair(mnemonics);
    console.log(`2`);
    const WalletClass = tonweb.wallet.all.v3R2;
    const userWallet = new WalletClass(tonweb.provider, {
      publicKey: keyPair.publicKey,
      wc: 0,
    });
     console.log(`3`);
     const fromuseraddress = await userWallet.getAddress();

 
    const from_addressStr = new TonWeb.utils.Address(fromuseraddress).toString(true, true, false);

    // 获取服务器初始余额
     const info = await tonweb.provider.getAddressInfo(from_addressStr);
     const fromBalanceNano = BigInt(info.balance || 0n);

     const transferAmountNano = BigInt(TonWeb.utils.toNano(amountTON.toString()));
     const estimatedFeeNano = BigInt(TonWeb.utils.toNano('0.03'));  // 假设手续费为 0.03 TON

     const requiredBalanceNano = transferAmountNano + estimatedFeeNano;

     // 判断APP钱包余额是否足够
     if (fromBalanceNano < requiredBalanceNano) {
        const currentBalanceTON = TonWeb.utils.fromNano(fromBalanceNano.toString());
        const requiredBalanceTON = TonWeb.utils.fromNano(requiredBalanceNano.toString());

        console.log(`[系统] APP钱包余额不足，无法完成转账（余额：${currentBalanceTON} TON，所需：${requiredBalanceTON} TON）`);

        return res.status(400).json({
          error: 'APP钱包余额不足，无法完成转账',
          success: false,
          currentBalance: currentBalanceTON,
          requiredBalance: requiredBalanceTON
        });
     }


    await sentClientTonToAdressHaveOrderId(userWallet,toAddress, amountTON,orderId,keyPair);
    console.log(`[系统] 已向用户地址转入 ${amountTON} TON: ${toAddress}  orderId:${orderId}`);

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
     console.error('[AppTonSendTonByAddress] 发生错误:', error);
     res.status(500).json({ 
      error: error.message || String(error),
      success: false,
      // orderId: orderId,
      // mnemonics: mnemonics,
      // amountTON: amountTON,

     });
  }

});


router.post('/createAppTonPaymentLinkByMnemonics', async (req, res) => {  //生成支付 二维码  

   const { orderId, mnemonics, amountTON } = req.body;

    if (!orderId  || !amountTON || !mnemonics) {
      return res.status(400).json({
        error: '参数缺失',
        success: false,
        orderId, amountTON
      });
    }
  const to_address = await getAddressForWebByMnemonics(mnemonics);
  // const toAddress = new TonWeb.utils.Address(server_address).toString(true, true, false);
  //const toAddress = Address.parse(server_address).toString({ urlSafe: true, bounceable: false });
  console.log("to_address = "+to_address)
  const amountNano = BigInt(Math.floor(parseFloat(amountTON) * 1e9));
  console.log("amountNano = "+amountNano)
  const tonLink = buildTonPaymentLink(to_address, amountNano, orderId);
  const tonhublink = buildTonPaymentTonhubLink(to_address, amountNano, orderId);
  const Tonkeeperlink = buildTonPaymentTonkeeperLink(to_address, amountNano, orderId);
  console.log("tonLink = "+tonLink)
  QRCode.toDataURL(tonLink, (err, url) => {
    if (!err) {
      // 展示 base64 图像
          res.status(200).json({
            success: true,
            url,
            tonhublink,
            Tonkeeperlink
          });
    }else{
        res.status(500).json({
          error: error.message || String(error),
          success: false
        });
    } 
  });

});


router.post('/getTransactionsInOrderIdByMnemonics', async (req, res) => {  //通过订单号查询服务器转入 成功和信息
  try {
    const { orderId,mnemonics } = req.body;


    if (!orderId || !mnemonics) {
      return res.status(400).json({
        error: '参数缺失',
        success: false,
        orderId, mnemonics
      });
    }

    const to_address = await getAddressForWebByMnemonics(mnemonics);
    const to_addressStr = new TonWeb.utils.Address(to_address).toString(true, true, false);

    const transactions = await getTransactionsInOrderId(to_addressStr, orderId);

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


router.post('/getTransactionsInOrderIdByAddress', async (req, res) => {  //通过订单号查询服务器转入 成功和信息
  try {
    const { orderId, toaddress } = req.body;


    if (!orderId || ! toaddress) {
      return res.status(400).json({
        error: '参数缺失',
        success: false,
        orderId, toaddress
      });
    }
 
    const to_addressStr = new TonWeb.utils.Address(toaddress).toString(true, true, false);

    const transactions = await getTransactionsInOrderId(to_addressStr, orderId);

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


router.post('/getTransactionsOutOrderIdByAddress', async (req, res) => {  //通过订单号查询服务器转入 成功和信息
  try {
    const { orderId, fromaddress } = req.body;


    if (!orderId || ! fromaddress) {
      return res.status(400).json({
        error: '参数缺失',
        success: false,
        orderId, fromaddress
      });
    }
 
    const from_addressStr = new TonWeb.utils.Address(fromaddress).toString(true, true, false);

    const transactions = await getTransactionsOutOrderId(from_addressStr, orderId);

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


router.post('/getTransactionsOutOrderOutByMnemonics', async (req, res) => {  //通过订单号查询服务器转入 成功和信息
  try {
    const { orderId, mnemonics } = req.body;


    if (!orderId || ! mnemonics) {
      return res.status(400).json({
        error: '参数缺失',
        success: false,
        orderId, mnemonics
      });
    }
 
    const from_address = await getAddressForWebByMnemonics(mnemonics);
    const from_addressStr = new TonWeb.utils.Address(from_address).toString(true, true, false);

    const transactions = await getTransactionsOutOrderId(from_addressStr, orderId);

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

router.post('/getTransactionsInHashByMnemonics', async (req, res) => {  //通过网站上显示的 trace ID的 hash 查询服务器转入 成功和信息
  try {
    const { hash , amount, time ,timezoneOffset, mnemonics} = req.body;


    if (!hash || !amount || !time || !timezoneOffset || !mnemonics) {   //time 2025/5/26 20:29:08 timezoneOffset "+08:00"
      return res.status(400).json({
        error: '参数缺失',
        success: false,
        hash , amount, time ,timezoneOffset,mnemonics
      });
    }

    const to_address = await getAddressForWebByMnemonics(mnemonics);
    const to_addressStr = new TonWeb.utils.Address(to_address).toString(true, true, false);

    const transactions = await getTransactionsInHash(to_addressStr, amount,hash,time ,timezoneOffset);

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





router.post('/getTonBalanceByMnemonics', async (req, res) => {   //获得余额

try {
    const { mnemonics } = req.body;

    if (!mnemonics) {
      return res.status(400).json({ error: '参数缺失',
        success: false,
        mnemonics });
    }

    const address = await getAddressForWebByMnemonics(mnemonics);

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

module.exports = router;