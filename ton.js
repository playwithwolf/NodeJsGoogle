const express = require('express');
const crypto = require('crypto');
const url = require('url');
const router = express.Router();
const querystring = require('querystring');
const tonMnemonic = require('tonweb-mnemonic');

const tonweb = new TonWeb(new TonWeb.HttpProvider('https://testnet.toncenter.com/api/v2/jsonRPC'));
router.post('/createWallet', async (req, res) => {
    console.log('Request body:', req.body);
try {
    // 生成 24 个助记词
    const mnemonics = await tonMnemonic.generateMnemonic();

    // 验证助记词
    const isValid = await tonMnemonic.validateMnemonic(mnemonics);
    if (!isValid) {
      return res.status(400).json({ error: '生成的助记词无效' });
    }

    // 从助记词生成密钥对
    const keyPair = await tonMnemonic.mnemonicToKeyPair(mnemonics);

    // 创建钱包实例（使用 v3R2 钱包合约）
    const WalletClass = tonweb.wallet.all.v3R2;
    const wallet = new WalletClass(tonweb.provider, {
      publicKey: keyPair.publicKey,
      wc: 0
    });

    // 获取钱包地址
    const address = await wallet.getAddress();

    // 返回钱包信息
    res.status(200).json({
      mnemonics,
      address: address.toFriendly(),
      bounceableAddress: address.toString(true, true, false),
      nonBounceableAddress: address.toString(false, true, false),
      publicKey: Buffer.from(keyPair.publicKey).toString('hex'),
      secretKey: Buffer.from(keyPair.secretKey).toString('hex'),
      walletVersion: 'v3R2'
    });
  } catch (error) {
    console.error('创建钱包失败:', error);
    res.status(500).json({ error: '创建钱包失败' });
  }

});

module.exports = router;