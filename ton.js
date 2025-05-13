const express = require('express');
const crypto = require('crypto');
const url = require('url');
const router = express.Router();
const querystring = require('querystring');
const tonMnemonic = require('tonweb-mnemonic');
const TonWeb = require('tonweb');
require('dotenv').config();
const tonweb = new TonWeb(new TonWeb.HttpProvider(process.env.TON_API));

const { sendTon } =  require('./server_ton_wallet');



const check_server_ton_wallet = require('./check_server_ton_wallet');



// async function sendTon(toAddress, amountTON) {
//   await init();

//   try {
//     // 获取 seqno
//     let seqno = await wallet.methods.seqno().call();
    
//     // 检查 seqno 是否为 null 或无效，如果无效则尝试重试获取
//     if (seqno === null || seqno < 0) {
//       console.log('[server_wallet] seqno 无效，正在尝试重新获取...');
//       seqno = await wallet.methods.seqno().call();
//       if (seqno === null || seqno < 0) {
//         throw new Error('无法获取有效的 seqno，钱包状态未同步');
//       }
//     }

//     const amountNano = TonWeb.utils.toNano(amountTON.toString());
//     console.log(`[server_wallet] 发送 ${amountTON} TON 到 ${toAddress}，当前 seqno=${seqno}`);

//     const result = await wallet.methods.transfer({
//       secretKey: keyPair.secretKey,
//       toAddress,
//       amount: amountNano,
//       seqno,
//       payload: null,
//       sendMode: 3,
//     }).send();

//     console.log('[server_wallet] 转账已发送');
//     return result;
//   } catch (err) {
//     console.error('[server_wallet] 转账失败:', err);
//     throw new Error('服务器钱包转账失败: ' + err.message);
//   }
// }

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
    const addressStr = address.toString(true, true, false);
    console.log('[系统] 用户钱包地址:', addressStr);

    // 2. 部署钱包（激活钱包）
    const deployTx = await userWallet.deploy(keyPair.secretKey);
    await deployTx.send();
    console.log('[系统] 钱包部署交易已发送');

    // 3. 等待钱包部署完成（钱包状态变为 active）
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

    // 2. 向地址转入启动资金（0.05 TON）
    await sendTon(addressStr, 0.05);
    console.log('[系统] 已向用户地址转入 0.05 TON:', addressStr);

    // 3. 轮询到账
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

    // // 4. 钱包合约部署
    // const deployTx = await userWallet.deploy(keyPair.secretKey);
    // await deployTx.send();
    // console.log('[系统] 钱包部署交易已发送');

    // 5. 可选轮询钱包激活状态
    let isDeployed = false;
    for (let i = 0; i < 5; i++) {
      const info = await tonweb.provider.getAddressInfo(addressStr);
      if (info.state === 'active') {
        isDeployed = true;
        break;
      }
      await new Promise(r => setTimeout(r, 3000));
    }

    if (!isDeployed) {
      return res.status(500).json({ error: '钱包部署失败，请稍后重试' });
    }

    // 6. 返回信息
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