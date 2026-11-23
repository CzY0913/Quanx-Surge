// ninebot_sign.js
// 单账号版 · 使用 Surge 自带通知

const KEY_DEVICE_ID = "ninebot_device_id";
const KEY_AUTH      = "ninebot_authorization";

const API_SIGN   = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign";
const API_STATUS = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status";

const HEADERS = {
  "Accept": "application/json, text/plain, */*",
  "Accept-Encoding": "gzip, deflate, br",
  "Accept-Language": "zh-CN,zh-Hans;q=0.9",
  "Content-Type": "application/json",
  "Host": "cn-cbu-gateway.ninebot.com",
  "Origin": "https://h5-bj.ninebot.com",
  "from_platform_1": "1",
  "language": "zh",
  "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Segway v6 C 609033420",
  "Referer": "https://h5-bj.ninebot.com/"
};

function request(method, url, body, auth) {
  return new Promise((resolve, reject) => {
    const opts = {
      url,
      headers: Object.assign({}, HEADERS, { Authorization: auth }),
      timeout: 10000
    };
    if (body) opts.body = JSON.stringify(body);

    const cb = (error, response, data) => {
      if (error) return reject(error);
      try { resolve(JSON.parse(data)); }
      catch (e) { resolve(data); }
    };

    if (method === "GET") $httpClient.get(opts, cb);
    else $httpClient.post(opts, cb);
  });
}

async function queryStatus(auth) {
  const data = await request("GET", `${API_STATUS}?t=${Date.now()}`, null, auth);
  if (data && data.code === 0) return data.data;
  throw new Error((data && data.msg) || "状态查询失败");
}

async function doSign(deviceId, auth) {
  const data = await request("POST", API_SIGN, { deviceId }, auth);
  if (data && data.code === 0) return true;
  throw new Error((data && data.msg) || "签到失败");
}

// ===== 改用 Surge 原生通知 =====
function notify(title, body) {
  $notification.post(title, "", body);
}
// =================================

(async () => {
  const deviceId = $persistentStore.read(KEY_DEVICE_ID);
  const auth     = $persistentStore.read(KEY_AUTH);

  if (!deviceId || !auth) {
    notify("九号签到 ❌ 配置缺失", "请先写入 deviceId 和 authorization");
    $done();
    return;
  }

  const lines = [];
  let ok = false;

  try {
    const info = await queryStatus(auth);
    lines.push(`连续签到: ${info.consecutiveDays || 0} 天`);
    const signed = info.currentSignStatus === 1;
    lines.push(`今日状态: ${signed ? "已签到" : "未签到"}`);

    if (!signed) {
      await doSign(deviceId, auth);
      lines.push("签到结果: 签到成功");
      ok = true;
      try {
        const after = await queryStatus(auth);
        lines.push(`最新连续签到: ${after.consecutiveDays || 0} 天`);
      } catch (e) {
        lines.push("获取最新状态失败");
      }
    } else {
      lines.push("今日已签到，跳过");
      ok = true;
    }
  } catch (e) {
    lines.push("执行异常: " + e.message);
  }

  const text = lines.join("\n");
  console.log(text);
  notify(ok ? "九号签到成功 ✅" : "九号签到失败 ❌", text);
  $done();
})();
