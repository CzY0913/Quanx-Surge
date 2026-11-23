// ninebot_sign.js
// 单账号版 · 配置存于 $persistentStore

// ===== 配置键名 =====
const KEY_DEVICE_ID = "ninebot_device_id";
const KEY_AUTH      = "ninebot_authorization";
const KEY_BARK      = "ninebot_bark_key";   // 可选

// ===== 接口常量 =====
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

// ===== 工具函数 =====
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

function sendBark(key, title, content) {
  if (!key) return;
  const url = `https://api.day.app/${key}/${encodeURIComponent(title)}/${encodeURIComponent(content)}?group=${encodeURIComponent("九号签到")}`;
  $httpClient.get(url, (err) => {
    if (err) console.log("Bark 推送失败: " + err);
  });
}

// ===== 主流程 =====
(async () => {
  const deviceId = $persistentStore.read(KEY_DEVICE_ID);
  const auth     = $persistentStore.read(KEY_AUTH);
  const barkKey  = $persistentStore.read(KEY_BARK) || "";

  if (!deviceId || !auth) {
    console.log("缺少 deviceId 或 authorization，请先写入 $persistentStore");
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
  sendBark(barkKey, ok ? "九号签到成功" : "九号签到失败", text);
  $done();
})();
