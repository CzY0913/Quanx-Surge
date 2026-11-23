/**
 * 九号出行自动签到 - Surge 脚本（修复版）
 * 
 * 使用方法：
 * 1. 在 Surge 中添加此脚本
 * 2. 在 Surge 控制台配置参数：
 *    $persistentStore.write("设备ID", "ninebot_device_id");
 *    $persistentStore.write("Bearer 令牌", "ninebot_authorization");
 * 
 * 定时任务配置示例：
 * 九号签到 = type=cron,cronexp="0 8 * * *",wake-system=1,timeout=120,script-path=ninebot-surge.js
 */

// 支持从 BoxJS 或 $persistentStore 读取参数
// BoxJS 优先级更高
const getParam = (key) => {
  // 首先尝试从 BoxJS 读取
  if (typeof $prefs !== 'undefined') {
    const val = $prefs.valueForKey(key);
    if (val) return val;
  }
  // 其次从 $persistentStore 读取
  if (typeof $persistentStore !== 'undefined') {
    return $persistentStore.read(key);
  }
  return null;
};

const DEVICE_ID = getParam("ninebot_device_id");
const AUTHORIZATION = getParam("ninebot_authorization");
const ACCOUNT_NAME = getParam("ninebot_name") || "九号出行";
const MULTI_ACCOUNTS = getParam("ninebot_accounts");
const BARK_KEY = getParam("bark_key");

class NineBot {
  constructor(deviceId, authorization, name = "九号出行") {
    if (!deviceId || !authorization) {
      throw new Error("缺少必要的参数: deviceId 或 authorization");
    }

    this.results = [];
    this.name = name;
    this.deviceId = deviceId;
    // 注意：不要手动设置 Host，Surge 会根据 URL 自动设置，
    // 手动设置会导致服务器重置连接（Socket closed by remote peer）
    this.headers = {
      "Accept": "application/json, text/plain, */*",
      "Authorization": authorization,
      "Accept-Language": "zh-CN,zh-Hans;q=0.9",
      "Content-Type": "application/json",
      "Origin": "https://h5-bj.ninebot.com",
      "from_platform_1": "1",
      "language": "zh",
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Segway v6 C 609033420",
      "Referer": "https://h5-bj.ninebot.com/",
      "device_id": deviceId
    };

    this.endpoints = {
      sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
      status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status"
    };
  }

  // HTTP GET 请求（带重试）
  async httpGet(url) {
    return this.requestWithRetry("get", url, null);
  }

  // HTTP POST 请求（带重试）
  async httpPost(url, body) {
    return this.requestWithRetry("post", url, body);
  }

  // 带重试的通用请求方法
  async requestWithRetry(method, url, body) {
    const maxRetries = 3;
    const retryDelay = 1500;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[${this.name}] ${method.toUpperCase()} ${url} (第 ${attempt}/${maxRetries} 次)`);
        return await this.doRequest(method, url, body);
      } catch (error) {
        console.log(`[${this.name}] 请求失败 (${attempt}/${maxRetries}): ${error.message}`);
        if (attempt === maxRetries) {
          throw error;
        }
        // 等待后重试
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  // 执行单次请求
  doRequest(method, url, body) {
    return new Promise((resolve, reject) => {
      const options = {
        url: url,
        headers: this.headers
      };

      if (method === "post" && body) {
        options.body = JSON.stringify(body);
      }

      const callback = (error, response, data) => {
        if (error) {
          reject(new Error(error));
          return;
        }
        try {
          const result = typeof data === "string" ? JSON.parse(data) : data;
          resolve(result);
        } catch (e) {
          reject(new Error(`响应解析失败: ${e.message}`));
        }
      };

      if (method === "post") {
        $httpClient.post(options, callback);
      } else {
        $httpClient.get(options, callback);
      }
    });
  }

  // 获取签到状态
  async getStatus() {
    try {
      console.log(`[${this.name}] 获取签到状态...`);
      const timestamp = Date.now();
      const url = `${this.endpoints.status}?t=${timestamp}`;
      const response = await this.httpGet(url);

      if (response.code === 0) {
        console.log(`[${this.name}] 获取状态成功`);
        return [response.data, ""];
      }

      const errorMsg = response.msg || "获取状态失败";
      console.log(`[${this.name}] 获取状态失败: ${errorMsg}`);
      return [null, errorMsg];
    } catch (error) {
      const errorMsg = `获取状态异常: ${error.message}`;
      console.log(`[${this.name}] ${errorMsg}`);
      return [null, errorMsg];
    }
  }

  // 执行签到
  async sign() {
    try {
      console.log(`[${this.name}] 开始签到...`);
      const response = await this.httpPost(this.endpoints.sign, {
        deviceId: this.deviceId
      });

      if (response.code === 0) {
        console.log(`[${this.name}] 签到成功`);
        return true;
      } else {
        const errorMsg = response.msg || "未知错误";
        console.log(`[${this.name}] 签到失败: ${errorMsg}`);
        return false;
      }
    } catch (error) {
      console.log(`[${this.name}] 签到异常: ${error.message}`);
      return false;
    }
  }

  // 运行签到流程
  async run() {
    try {
      console.log(`[${this.name}] 开始执行签到任务...`);

      // 获取签到状态
      const [statusData, statusError] = await this.getStatus();

      if (!statusData) {
        this.results.push(`${this.name}: 获取状态失败 - ${statusError}`);
        return;
      }

      const isCompleted = statusData.currentSignStatus === 1;
      const consecutiveDays = statusData.consecutiveDays || 0;

      this.results.push(`${this.name}:`);
      this.results.push(`  连续签到: ${consecutiveDays}天`);
      this.results.push(`  今日状态: ${isCompleted ? "已签到 ✅" : "未签到 ❌"}`);

      if (!isCompleted) {
        const signSuccess = await this.sign();
        if (signSuccess) {
          // 等待一秒再获取最新状态
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // 签到后重新获取状态
          const [newStatusData] = await this.getStatus();
          if (newStatusData) {
            const newDays = newStatusData.consecutiveDays || 0;
            this.results.push(`  签到结果: 成功 🎉`);
            this.results.push(`  最新连续天数: ${newDays}天`);
          } else {
            this.results.push(`  签到结果: 成功，但未能获取最新状态`);
          }
        } else {
          this.results.push(`  签到结果: 失败 ❌`);
        }
      } else {
        this.results.push(`  签到结果: 今日已签到，无需重复`);
      }
    } catch (error) {
      this.results.push(`${this.name}: 执行异常 - ${error.message}`);
      console.log(`[${this.name}] 执行异常: ${error.message}`);
    }
  }

  // 获取日志
  get logs() {
    return this.results.join("\n");
  }
}

// 安全通知函数：手动执行环境下 $notify 可能不可用，避免抛异常
function safeNotify(title, subtitle, message) {
  try {
    if (typeof $notify === "function") {
      $notify(title, subtitle, message);
      return;
    }
  } catch (e) {
    console.log("[通知] 系统通知不可用，改用日志输出");
  }
  // 兜底：打印到日志
  console.log(`\n[${title}]\n${subtitle ? subtitle + "\n" : ""}${message}`);
}

// 安全结束函数：保证 $done 只调用一次，避免超时
let doneCalled = false;
function safeDone() {
  if (doneCalled) return;
  doneCalled = true;
  try {
    if (typeof $done === "function") {
      $done();
    }
  } catch (e) {
    console.log("脚本结束");
  }
}

// 发送 Bark 通知
function sendBarkNotification(title, message) {
  if (!BARK_KEY) {
    console.log("未配置 BARK_KEY，跳过 Bark 通知");
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const url = `https://api.day.app/${BARK_KEY}/${encodeURIComponent(title)}/${encodeURIComponent(message)}`;
    console.log("发送 Bark 通知...");
    
    $httpClient.get(url, (error) => {
      if (error) {
        console.log("Bark 通知发送失败:", error);
      } else {
        console.log("Bark 通知发送成功");
      }
      resolve();
    });
  });
}

// 主函数
async function main() {
  console.log("===== 九号出行签到脚本开始执行 =====");
  
  const accounts = [];

  // 处理多账号配置
  if (MULTI_ACCOUNTS) {
    try {
      const parsed = JSON.parse(MULTI_ACCOUNTS);
      if (Array.isArray(parsed)) {
        accounts.push(
          ...parsed.map((acc, index) => ({
            name: acc.name || `账号${index + 1}`,
            deviceId: acc.deviceId,
            authorization: acc.authorization
          }))
        );
        console.log(`加载了 ${accounts.length} 个多账号配置`);
      }
    } catch (e) {
      console.log("MULTI_ACCOUNTS 格式错误:", e.message);
    }
  }

  // 处理单账号配置
  if (accounts.length === 0 && DEVICE_ID && AUTHORIZATION) {
    accounts.push({
      name: ACCOUNT_NAME,
      deviceId: DEVICE_ID,
      authorization: AUTHORIZATION
    });
    console.log("加载了单账号配置");
  }

  if (accounts.length === 0) {
    const errorMsg = "未配置任何账号信息";
    console.log("错误: " + errorMsg);
    safeNotify("九号出行签到", "配置错误", errorMsg);
    safeDone();
    return;
  }

  // 执行所有账号的签到
  const allLogs = [];
  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    console.log(`\n----- 处理账号 ${i + 1}/${accounts.length}: ${account.name} -----`);
    
    try {
      const bot = new NineBot(account.deviceId, account.authorization, account.name);
      await bot.run();
      allLogs.push(bot.logs);
    } catch (error) {
      const errorLog = `${account.name}: 初始化失败 - ${error.message}`;
      console.log(errorLog);
      allLogs.push(errorLog);
    }
  }

  const finalMessage = allLogs.join("\n\n");
  const title = "九号出行签到结果";

  // 使用安全通知（cron 环境发系统通知，手动环境打印日志）
  safeNotify(title, "", finalMessage);

  // 发送 Bark 通知
  if (BARK_KEY) {
    await sendBarkNotification(title, finalMessage);
  }

  console.log("===== 脚本执行完成 =====");
  safeDone();
}

// 执行（用 try/finally 保证一定收尾，避免 Script Timeout）
(async () => {
  try {
    await main();
  } catch (error) {
    const msg = (error && error.message) ? error.message : String(error);
    console.log("执行异常: " + msg);
    safeNotify("九号出行签到", "执行异常", msg);
  } finally {
    safeDone();
  }
})();
