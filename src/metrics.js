const config = require('./config');

// HTTPリクエストの累積カウンター
let totalRequests = 0;
let getRequests = 0;
let postRequests = 0;
let putRequests = 0;
let deleteRequests = 0;

function requestTracker(req, res, next) {
  totalRequests++;
  if (req.method === 'GET') {
    getRequests++;
  } else if (req.method === 'POST') {
    postRequests++;
  } else if (req.method === 'PUT') {
    putRequests++;
  } else if (req.method === 'DELETE') {
    deleteRequests++;
  }
  next();
}

// 1分ごとに現在のリクエストカウンターを Grafana に送信
setInterval(() => {
  sendMetricToGrafana('total_requests', totalRequests, 'sum', '1');
  sendMetricToGrafana('get_requests', getRequests, 'sum', '1');
  sendMetricToGrafana('post_requests', postRequests, 'sum', '1');
  sendMetricToGrafana('put_requests', putRequests, 'sum', '1');
  sendMetricToGrafana('delete_requests', deleteRequests, 'sum', '1');
}, 60000);

/**
 * Grafana にメトリクスを送信する関数
 * サンプルコードと同様の形式で、metricName, metricValue, type, unit を受け取ってデータを送信します。
 */
function sendMetricToGrafana(metricName, metricValue, type, unit) {
  const metric = {
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics: [
              {
                name: metricName,
                unit: unit,
                [type]: {
                  dataPoints: [
                    {
                      asInt: metricValue,
                      timeUnixNano: Date.now() * 1000000,
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
  };

  if (type === 'sum') {
    metric.resourceMetrics[0].scopeMetrics[0].metrics[0][type].aggregationTemporality =
      'AGGREGATION_TEMPORALITY_CUMULATIVE';
    metric.resourceMetrics[0].scopeMetrics[0].metrics[0][type].isMonotonic = true;
  }

  const body = JSON.stringify(metric);
  fetch(`${config.metrics.url}`, {
    method: 'POST',
    body: body,
    headers: {
      Authorization: `Bearer ${config.metrics.apiKey}`,
      'Content-Type': 'application/json'
    },
  })
    .then((response) => {
      if (!response.ok) {
        response.text().then((text) => {
          console.error(`Failed to push ${metricName}: ${text}\n${body}`);
        });
      } else {
        console.log(`Pushed ${metricName}`);
      }
    })
    .catch((error) => {
      console.error('Error pushing metrics:', error);
    });
}

// CPU使用率を計算する関数
function getCpuUsagePercentage() {
    const loadAvg = os.loadavg()[0];
    const cpuCount = os.cpus().length;
    const cpuUsage = (loadAvg / cpuCount) * 100;
    return Number(cpuUsage.toFixed(2));
  }
  
  // メモリ使用率を計算する関数
  function getMemoryUsagePercentage() {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsage = (usedMemory / totalMemory) * 100;
    return Number(memoryUsage.toFixed(2));
  }
  
  // CPU とメモリのメトリクスを1秒ごとに送信
  setInterval(() => {
    sendMetricToGrafana('cpu', getCpuUsagePercentage(), 'gauge', '%');
    sendMetricToGrafana('memory', getMemoryUsagePercentage(), 'gauge', '%');
  }, 1000);
  

module.exports = {
  requestTracker,
};
