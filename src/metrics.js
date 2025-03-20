const config = require('./config');
const os = require('os');

let totalRequests = 0;
let getRequests = 0;
let postRequests = 0;
let putRequests = 0;
let deleteRequests = 0;
let activeUsers = 0;
// Add these variables at the top
let authSuccessAttempts = 0;
let authFailAttempts = 0;

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
        activeUsers = Math.max(0, activeUsers - 1); // Decrease active users on logout, but never go below 0
    }
    next();
}

setInterval(() => {
    sendMetricToGrafana('active_users', activeUsers, 'gauge', 'count');
}, 60000);

// Helper functions to update the counters
function trackAuthSuccess() {
  authSuccessAttempts++;
}
function trackAuthFail() {
  authFailAttempts++;
}

setInterval(() => {
  // Report authentication metrics
  sendMetricToGrafana('auth_success_attempts', authSuccessAttempts, 'sum', '1');
  sendMetricToGrafana('auth_fail_attempts', authFailAttempts, 'sum', '1');
}, 60000);
  

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

// Provided CPU and memory functions
function getCpuUsagePercentage() {
    const cpuUsage = os.loadavg()[0] / os.cpus().length;
    return cpuUsage.toFixed(2) * 100;
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


module.exports = {
  requestTracker,
  trackActiveUsers,
  trackAuthSuccess,
  trackAuthFail,
  sendMetricToGrafana
};