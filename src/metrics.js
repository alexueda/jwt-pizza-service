const os = require('os');
const config = require('../config'); // 環境変数等から設定を読み込む

// ── CPU 使用率を計算する関数（％） ─────────────────────────────
function getCpuUsagePercentage() {
  const loadAvg = os.loadavg()[0];
  const cpuCount = os.cpus().length;
  const cpuUsage = loadAvg / cpuCount;
  return (cpuUsage * 100).toFixed(2);
}

// ── メモリ使用率を計算する関数（％） ─────────────────────────────
function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  return ((usedMemory / totalMemory) * 100).toFixed(2);
}

// ── MetricBuilder クラス ─────────────────────────────
// 各種メトリクスの文字列を蓄積するためのシンプルなクラス
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

// ── HTTP リクエストメトリクス ─────────────────────────────
// Express ミドルウェアとして利用できる requestTracker
function requestTracker(req, res, next) {
  if (!global.httpRequestCount) {
    global.httpRequestCount = 0;
  }
  global.httpRequestCount++;
  next();
}

// 定期レポート時に HTTP リクエスト数を報告する関数
function httpMetrics(buf) {
  const count = global.httpRequestCount || 0;
  buf.add(`http_requests_total{source="${config.metrics.source}"} ${count}`);
  global.httpRequestCount = 0;
}

// ── ユーザーメトリクス ─────────────────────────────
// シミュレーションとしてランダムなアクティブユーザー数を報告
function userMetrics(buf) {
  const activeUsers = Math.floor(Math.random() * 100) + 1;
  buf.add(`active_users_total{source="${config.metrics.source}"} ${activeUsers}`);
}

// ── 認証メトリクス ─────────────────────────────
// グローバル変数に保持している認証試行、成功、失敗を報告
function authMetrics(buf) {
  const attempts = global.authAttempts || 0;
  const success = global.authSuccess || 0;
  const failure = global.authFailure || 0;
  buf.add(`auth_attempts_total{source="${config.metrics.source}"} ${attempts}`);
  buf.add(`auth_success_total{source="${config.metrics.source}"} ${success}`);
  buf.add(`auth_fail_total{source="${config.metrics.source}"} ${failure}`);
  global.authAttempts = 0;
  global.authSuccess = 0;
  global.authFailure = 0;
}

// ── システムメトリクス ─────────────────────────────
// CPU およびメモリ使用率を報告
function systemMetrics(buf) {
  const cpu = getCpuUsagePercentage();
  const mem = getMemoryUsagePercentage();
  buf.add(`cpu_percent{source="${config.metrics.source}"} ${cpu}`);
  buf.add(`memory_percent{source="${config.metrics.source}"} ${mem}`);
}

// ── ピザ関連メトリクス ─────────────────────────────
// 売れたピザ数、ピザ作成失敗数、売上を報告
function purchaseMetrics(buf) {
  const sold = global.pizzaSold || 0;
  const failures = global.pizzaCreationFailures || 0;
  const revenue = global.pizzaRevenue || 0;
  buf.add(`pizza_sold_total{source="${config.metrics.source}"} ${sold}`);
  buf.add(`pizza_creation_failures_total{source="${config.metrics.source}"} ${failures}`);
  buf.add(`pizza_revenue_total{source="${config.metrics.source}"} ${revenue}`);
  global.pizzaSold = 0;
  global.pizzaCreationFailures = 0;
  global.pizzaRevenue = 0;
}

// ── レイテンシメトリクス ─────────────────────────────
// サービスエンドポイントとピザ作成 API の遅延（秒単位）を報告
function latencyMetrics(buf) {
  const serviceLatencyMs = Math.random() * 1000;      // 0～1000ms
  const pizzaCreationLatencyMs = Math.random() * 2000;  // 0～2000ms
  buf.add(`service_latency_seconds{source="${config.metrics.source}"} ${(serviceLatencyMs / 1000).toFixed(2)}`);
  buf.add(`pizza_creation_latency_seconds{source="${config.metrics.source}"} ${(pizzaCreationLatencyMs / 1000).toFixed(2)}`);
}

// ── 定期レポート ─────────────────────────────
// 指定した間隔ごとにすべてのメトリクスを収集し、Grafana に送信する
function sendMetricsPeriodically(period) {
  setInterval(() => {
    try {
      const buf = new MetricBuilder();
      httpMetrics(buf);
      systemMetrics(buf);
      userMetrics(buf);
      purchaseMetrics(buf);
      authMetrics(buf);
      latencyMetrics(buf);
      
      const metricsData = buf.toString('\n');
      sendMetricToGrafana(metricsData);
    } catch (err) {
      console.log('Error sending metrics', err);
    }
  }, period);
}

// ── Grafana への送信 ─────────────────────────────
// Grafana Cloud の URL にメトリクスデータを送信する
function sendMetricToGrafana(metrics) {
  fetch(config.metrics.url, {
    method: 'POST',
    body: metrics,
    headers: {
      Authorization: `Bearer ${config.metrics.apiKey}`,
      'Content-Type': 'application/json',
    },
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
    .catch((err) => {
      console.error('Error pushing metrics:', err);
    });
}

module.exports = {
  sendMetricsPeriodically,
  requestTracker,
};
