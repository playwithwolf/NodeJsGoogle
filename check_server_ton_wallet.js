const { getAddress, isDeployed } = require('./server_ton_wallet');

(async () => {
  const deployed = await isDeployed();
  if (!deployed) {
    console.log('[server_wallet] 钱包未部署，开始部署...');
    await deploy();
  } else {
    console.log('[server_wallet] 钱包已部署');
  }
})();
