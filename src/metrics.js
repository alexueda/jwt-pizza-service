// /src/metrics.js
const config = require('./config');
const os = require('os');

// Counters for HTTP requests
let totalRequests = 0;
let getRequests = 0;
let postRequests = 0;
let putRequests = 0;
let deleteRequests = 0;
// Counter for active users
let activeUsers = 0;
// Counters for authentication attempts
let successfulAuthAttempts = 0;
let failedAuthAttempts = 0;

// (Old pizza metrics and latency tracking middleware removed)

// Middleware to track HTTP requests
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

setInterval(() => {
  sendMetricToGrafana('total_requests', totalRequests, 'sum', '1');
  sendMetricToGrafana('get_requests', getRequests, 'sum', '1');
  sendMetricToGrafana('post_requests', postRequests, 'sum', '1');
  sendMetricToGrafana('put_requests', putRequests, 'sum', '1');
  sendMetricToGrafana('delete_requests', deleteRequests, 'sum', '1');
}, 60000);

// Track active users on login/logout
function trackActiveUsers(req, res, next) {
  if (req.method === 'PUT' && req.url === '/api/auth') {
    activeUsers++; // Increase active users on login
  } else if (req.method === 'DELETE' && req.url === '/api/auth') {
    activeUsers = Math.max(0, activeUsers - 1);
  }
  next();
}

setInterval(() => {
  sendMetricToGrafana('active_users', activeUsers, 'gauge', 'count');
}, 60000);

// CPU and Memory usage functions
function getCpuUsagePercentage() {
  const cpuUsage = os.loadavg()[0] / os.cpus().length;
  return (cpuUsage.toFixed(2) * 100);
}

function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsage = (usedMemory / totalMemory) * 100;
  return memoryUsage.toFixed(2);
}

setInterval(() => {
  sendMetricToGrafana('cpu', getCpuUsagePercentage(), 'gauge', '%');
  sendMetricToGrafana('memory', getMemoryUsagePercentage(), 'gauge', '%');
}, 1000);

// Track authentication attempts
function trackAuthAttempts(req, res, next) {
  if (req.method === 'PUT' && req.url === '/api/auth') {
    res.on('finish', () => {
      if (res.statusCode === 200) {
        successfulAuthAttempts++;
      } else {
        failedAuthAttempts++;
      }
    });
  }
  next();
}

setInterval(() => {
  sendMetricToGrafana('successful_auth_attempts', successfulAuthAttempts, 'sum', '1');
  sendMetricToGrafana('failed_auth_attempts', failedAuthAttempts, 'sum', '1');
  successfulAuthAttempts = 0;
  failedAuthAttempts = 0;
}, 60000);

// Track general request latency
function trackLatency(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const serviceLatency = Date.now() - start;
    sendMetricToGrafana('service_latency', serviceLatency, 'gauge', 'ms');
  });
  next();
}

// Helper: Send metric to Grafana
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
                      asDouble: metricValue,
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

module.exports = {
  requestTracker,
  trackActiveUsers,
  trackAuthAttempts,
  trackLatency,
  sendMetricToGrafana,
};
