// xiaomiClient.js
const axios = require('axios');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const appId = '2882303761522303522';
const appSecret = 'fk74Ehay6peS0X8tV595cg==';
const packageName = 'com.tianlutec.game.sudokumaster.googleplay';

function createSignature(method, contentType, nonce, requestPath, body) {
  let contentMd5 = '';
  if (method === 'POST' && body) {
    const md5 = crypto.createHash('md5').update(body, 'utf8').digest();
    contentMd5 = md5.toString('base64').toUpperCase();
  }

  let signStr = method + '\n';
  if (method === 'POST' && body) {
    signStr += contentMd5 + '\n';
  } else {
    signStr += '\n';
  }
  signStr += contentType + '\n\n';
  signStr += 'x-ias-sign-nonce:' + nonce + '\n';
  signStr += requestPath;

  const hmac = crypto.createHmac('sha1', appSecret);
  hmac.update(signStr, 'utf8');
  const signature = hmac.digest('base64');

  return { signature, contentMd5, signStr };
}

export async function callXiaomiAPI(method, urlPathTemplate, token, productId, body = null) {
  const region = token.substring(1, 3);
  const contentType = 'application/json';
  const nonce = uuidv4();
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const urlPath = urlPathTemplate
    .replace('{region}', region)
    .replace('{packageName}', packageName)
    .replace('{productId}', productId)
    .replace('{token}', token);

  const requestPath = urlPath.startsWith('/') ? urlPath : '/' + urlPath;
  const bodyStr = body ? JSON.stringify(body) : null;
  const { signature, contentMd5 } = createSignature(method, contentType, nonce, requestPath, bodyStr);

  const headers = {
    appId,
    timestamp,
    'x-ias-sign-nonce': nonce,
    'Content-Type': contentType,
    Authorization: 'ias ' + signature,
  };
  if (method === 'POST' && bodyStr) {
    headers['Content-MD5'] = contentMd5;
  }

  const fullUrl = 'https://rest-iap.miglobalpay.com' + requestPath;

  const response = await axios({
    method,
    url: fullUrl,
    headers,
    data: bodyStr,
  });
  return response.data;
}
