import axios from 'axios';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

const appId = '2882303761522303522';
const appSecret = 'fk74Ehay6peS0X8tV595cg==';
const packageName = 'com.tianlutec.game.sudokumaster.googleplay';
const productId = 'coin001';
const purchaseToken = 'PCN250522191824752289396701949872';

// 计算签名函数，支持GET和POST（含body或无body）
function createSignature(method, contentType, nonce, requestPath, body) {
  // Content-MD5头（POST有body时）
  let contentMd5 = '';
  if (method === 'POST' && body) {
    const md5 = crypto.createHash('md5').update(body, 'utf8').digest();
    contentMd5 = md5.toString('base64').toUpperCase();
  }

  // 组装签名字符串
  // GET格式：
  // GET\n\napplication/json\n\nx-ias-sign-nonce:<nonce>\n<requestPath>
  //
  // POST无body：
  // POST\n\napplication/json\n\nx-ias-sign-nonce:<nonce>\n<requestPath>
  //
  // POST有body：
  // POST\n<Content-MD5>\napplication/json\n\nx-ias-sign-nonce:<nonce>\n<requestPath>
  let signStr = method + '\n';
  if (method === 'POST' && body) {
    signStr += contentMd5 + '\n';
  } else {
    signStr += '\n';
  }
  signStr += contentType + '\n\n';
  signStr += 'x-ias-sign-nonce:' + nonce + '\n';
  signStr += requestPath;

  // 计算HMAC-SHA1签名并Base64
  const hmac = crypto.createHmac('sha1', appSecret);
  hmac.update(signStr, 'utf8');
  const signature = hmac.digest('base64');

  return { signature, contentMd5, signStr };
}

async function sendRequest(method, url, body = null) {
  const contentType = 'application/json';
  const nonce = uuidv4();
  const timestamp = Math.floor(Date.now() / 1000).toString();

  // 解析 region（token第2~3位）
  const region = purchaseToken.substring(1, 3);
  // 请求路径 = 域名后的路径，不含域名
  // url参数中需要替换{region}为region，{packageName}等替换
  const pathPart = url
    .replace('{region}', region)
    .replace('{packageName}', packageName)
    .replace('{productId}', productId)
    .replace('{token}', purchaseToken);

  // 请求路径要以 / 开头，确认格式正确
  const requestPath = pathPart.startsWith('/') ? pathPart : '/' + pathPart;

  // body字符串化
  const bodyStr = body ? JSON.stringify(body) : null;

  // 计算签名
  const { signature, contentMd5, signStr } = createSignature(method, contentType, nonce, requestPath, bodyStr);

  // 构造请求头
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

  console.log('--- 调试信息 ---');
  console.log('请求方法:', method);
  console.log('请求路径:', requestPath);
  console.log('签名字符串 (signStr):\n' + signStr);
  console.log('签名结果 (Base64):', signature);
  console.log('请求头:', headers);
  if (bodyStr) {
    console.log('请求体:', bodyStr);
  }

  try {
    const fullUrl = 'https://rest-iap.miglobalpay.com' + requestPath;
    const res = await axios({
      method,
      url: fullUrl,
      headers,
      data: bodyStr,
    });
    console.log('响应状态码:', res.status);
    console.log('响应数据:', res.data);
  } catch (err) {
    if (err.response) {
      console.log('请求错误，状态码:', err.response.status);
      console.log('错误响应数据:', err.response.data);
    } else {
      console.error('请求失败:', err.message);
    }
  }
}

async function main() {
  // 1. 查询购买（GET）
  await sendRequest(
    'GET',
    '/{region}/developer/v1/applications/{packageName}/purchases/products/{productId}/tokens/{token}',
  );

  // 2. 确认购买（POST），developerPayload可选，示例带字符串说明
  await sendRequest(
    'POST',
    '/{region}/developer/v1/applications/{packageName}/purchases/products/{productId}/tokens/{token}:acknowledge',
    { developerPayload: '确认发货凭证: order#123456' },
  );

  // 3. 消耗购买（POST），developerPayload可选
  await sendRequest(
    'POST',
    '/{region}/developer/v1/applications/{packageName}/purchases/products/{productId}/tokens/{token}:consume',
    { developerPayload: '消耗订单凭证: order#123456' },
  );
}

main();
