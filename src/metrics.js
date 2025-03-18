const os = require('os');
const config = require('./config');

// CPU 使用率を計算する関数
function getCpuUsagePercentage() {
  const loadAvg = os.loadavg()[0];
  const cpuCount = os.cpus().length;
  const cpuUsage = loadAvg / cpuCount;
  return (cpuUsage * 100).toFixed(2);
}

// メモリ使用率を計算する関数
function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  return ((usedMemory / totalMemory) * 100).toFixed(2);
}

// 各種メトリクスを構築するための仮の MetricBuilder クラス
class MetricBuilder {
  constructor() {
    this.metrics = [];
  }
  add(metric) {
    this.metrics.push(metric);
  }
  toString(separator = '\n') {
    return this.metrics.join(separator);
  }
}

// HTTP リクエストメトリクスのサンプル関数
function httpMetrics(buf) {
  // ここで、受信した HTTP リクエスト数などのメトリクスを buf に追加する
  // 例：buf.add(`http_requests_total{source="${config.metrics.source}"} 100`);
}

// システムメトリクス（CPU, メモリ）を追加する関数
function systemMetrics(buf) {
  const cpu = getCpuUsagePercentage();
  const mem = getMemoryUsagePercentage();
  buf.add(`cpu_percent{source="${config.metrics.source}"} ${cpu}`);
  buf.add(`memory_percent{source="${config.metrics.source}"} ${mem}`);
}

// ユーザーメトリクス、認証メトリクス、購入メトリクスも同様に定義する
function userMetrics(buf) {
  // 例：buf.add(`active_users_total{source="${config.metrics.source}"} 50`);
}

function authMetrics(buf) {
  // 例：buf.add(`auth_attempts_total{source="${config.metrics.source}"} 20`);
}

function purchaseMetrics(buf) {
  // ここでは、ピザ購入に関するメトリクスを追加
  // 例：buf.add(`pizza_sold_total{source="${config.metrics.source}"} 5`);
}

// 定期的に各種メトリクスを送信する関数
function sendMetricsPeriodically(period) {
  setInterval(() => {
    try {
      const buf = new MetricBuilder();
      httpMetrics(buf);
      systemMetrics(buf);
      userMetrics(buf);
      purchaseMetrics(buf);
      authMetrics(buf);

      const metricsData = buf.toString('\n');
      sendMetricToGrafana(metricsData);
    } catch (error) {
      console.log('Error sending metrics', error);
    }
  }, period);
}

// Grafana にメトリクスデータを送信する関数
function sendMetricToGrafana(metrics) {
  // ここでは、以前の metricsGenerator.js と同様の送信処理を行う
  fetch(config.metrics.url, {
    method: 'POST',
    body: metrics,
    headers: { Authorization: `Bearer ${config.metrics.apiKey}`, 'Content-Type': 'application/json' },
  })
    .then((response) => {
      if (!response.ok) {
        response.text().then((text) => {
          console.error(`Failed to push metrics: ${text}\n${metrics}`);
        });
      } else {
        console.log('Metrics sent successfully');
      }
    })
    .catch((error) => {
      console.error('Error pushing metrics:', error);
    });
}

module.exports = { sendMetricsPeriodically };
