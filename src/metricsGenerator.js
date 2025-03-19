const fetch = require('node-fetch');
const config = require('./config');

// Counters for HTTP requests
let requests = 0;
let getRequests = 0;
let postRequests = 0;
let putRequests = 0;
let deleteRequests = 0;

// Random integer in [min, max]
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Update CPU, memory, and HTTP request metrics every second
setInterval(() => {
  const cpuValue = randomInt(10, 90); // Simulate CPU usage
  sendMetricToGrafana('cpu', cpuValue, 'gauge', '%');

  const memoryValue = randomInt(20, 95); // Simulate memory usage
  sendMetricToGrafana('memory', memoryValue, 'gauge', '%');

  requests += randomInt(50, 200); // Increment requests
  sendMetricToGrafana('requests', requests, 'sum', '1');

  getRequests += randomInt(10, 50); // Increment GET requests
  sendMetricToGrafana('get_requests', getRequests, 'sum', '1');

  postRequests += randomInt(10, 50); // Increment POST requests
  sendMetricToGrafana('post_requests', postRequests, 'sum', '1');

  putRequests += randomInt(10, 50); // Increment PUT requests
  sendMetricToGrafana('put_requests', putRequests, 'sum', '1');

  deleteRequests += randomInt(10, 50); // Increment DELETE requests
  sendMetricToGrafana('delete_requests', deleteRequests, 'sum', '1');
}, 1000);

// Update active users and auth metrics every minute
setInterval(() => {
  const activeUsers = randomInt(2, 4); // Simulate active users
  sendMetricToGrafana('active_users', activeUsers, 'gauge', '1');

  const authSuccess = Math.random() * (0.15 - 0.05) + 0.05; // Simulate auth success
  const authFailure = Math.random() * (0.15 - 0.05) + 0.05; // Simulate auth failure
  sendMetricToGrafana('auth_success', authSuccess, 'gauge', '1');
  sendMetricToGrafana('auth_failure', authFailure, 'gauge', '1');
}, 60000);

// Send metric to Grafana
function sendMetricToGrafana(metricName, metricValue, metricType, unit) {
  const dataPoint = Number.isInteger(metricValue)
    ? { asInt: metricValue, timeUnixNano: Date.now() * 1000000 }
    : { asDouble: metricValue, timeUnixNano: Date.now() * 1000000 };

  const metric = {
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics: [
              {
                name: metricName,
                unit: unit,
                [metricType]: {
                  dataPoints: [dataPoint],
                },
              },
            ],
          },
        ],
      },
    ],
  };

  // Configure sum metrics
  if (metricType === 'sum') {
    metric.resourceMetrics[0].scopeMetrics[0].metrics[0][metricType].aggregationTemporality =
      'AGGREGATION_TEMPORALITY_CUMULATIVE';
    metric.resourceMetrics[0].scopeMetrics[0].metrics[0][metricType].isMonotonic = true;
  }

  const body = JSON.stringify(metric);
  fetch(config.url, {
    method: 'POST',
    body: body,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
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
      console.error(`Error pushing ${metricName}:`, error);
    });
}
