const { getAddress, isDeployed } = require('./server_ton_wallet');

(async () => {
  const address = await getAddress();
  const deployed = await isDeployed();

  console.log('服务器钱包地址:', address);
  console.log('是否已部署:', deployed ? '是' : '否');
})();
