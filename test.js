const { Address } = require('@ton/core');

const bounceable = 'EQD94MQ3uFPQqignlZ-V424cXRokraQu2TvnaQBSAtX5W80s';
const addr = Address.parse(bounceable);

console.log(addr.toString({ bounceable: false,
  urlSafe: true,
  testOnly: true  }));