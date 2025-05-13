const express = require('express');
const crypto = require('crypto');
const url = require('url');
const router = express.Router();
const querystring = require('querystring');
const tonMnemonic = require('tonweb-mnemonic');
const TonWeb = require('tonweb');
require('dotenv').config();

const serverWallet = require('./server_ton_wallet');

const tonweb = new TonWeb(new TonWeb.HttpProvider(process.env.TON_API));
router.post('/createTonWallet', async (req, res) => {
  try {
    // 生成助记词
    const mnemonics = await tonMnemonic.generateMnemonic();
    const isValid = await tonMnemonic.validateMnemonic(mnemonics);
    if (!isValid) {
      return res.status(400).json({ error: '生成的助记词无效' });
    }

    const keyPair = await tonMnemonic.mnemonicToKeyPair(mnemonics);
    const WalletClass = tonweb.wallet.all.v3R2;

    const userWallet = new WalletClass(tonweb.provider, {
      publicKey: keyPair.publicKey,
      wc: 0
    });

    const address = await userWallet.getAddress();
    const addressStr = address.toString(true, true, false);

    // 第一步：转账 0.05 TON 激活地址
    await serverWallet.sendTon(addressStr, 0.05);
    console.log('已向用户地址转入 0.05 TON');

    // 第二步：轮询确认地址激活（部署钱包需要激活状态）
    let isReady = false;
    for (let i = 0; i < 6; i++) {
      const deployed = await userWallet.isDeployed();
      if (deployed) {
        isReady = true;
        break;
      }
      console.log(`等待地址激活中（第 ${i + 1} 次）...`);
      await new Promise(r => setTimeout(r, 5000)); // 5 秒等待
    }

    if (!isReady) {
      return res.status(500).json({ error: '地址未激活，部署失败，请稍后重试' });
    }

    // 第三步：部署合约
    await userWallet.deploy(keyPair.secretKey).send();

    // 返回信息
    res.status(200).json({
      mnemonics,
      bounceableAddress: address.toString(true, true, true),
      nonBounceableAddress: address.toString(true, true, false),
      rawAddress: address.toString(false, false, false),
      publicKey: Buffer.from(keyPair.publicKey).toString('hex'),
      secretKey: Buffer.from(keyPair.secretKey).toString('hex'),
      walletVersion: 'v3R2'
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