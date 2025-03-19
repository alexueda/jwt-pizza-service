const config = require('./config');
const os = require('os');

// Global counters for various metrics
let requests = 0;
let getRequests = 0;
let postRequests = 0;
let putRequests = 0;
let deleteRequests = 0;
let latency = 0;
let pizzaSold = 0;
let pizzaCreationFailures = 0;
let pizzaRevenue = 0;
let authAttempts = 0;
let authSuccess = 0;
let authFailure = 0;

// Express middleware to count HTTP requests by method
function requestTracker(req, res, next) {
  // Total request count
  requests++;
  // Increment the counter for each HTTP method
  switch (req.method) {
    case 'GET':
      getRequests++;
      break;
    case 'POST':
      postRequests++;
      break;
    case 'PUT':
      putRequests++;
      break;
    case 'DELETE':
      deleteRequests++;
      break;
  }
  next();
}

// System metrics calculation functions (CPU, memory)
function getCpuUsagePercentage() {
  const loadAvg = os.loadavg()[0];
  const cpuCount = os.cpus().length;
  const cpuUsage = loadAvg / cpuCount;
  return (cpuUsage * 100).toFixed(2);
}
function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  return ((usedMemory / totalMemory) * 100).toFixed(2);
}

// Send metrics every second
setInterval(() => {
  // System metrics
  const cpuValue = Math.floor(getCpuUsagePercentage());
  const memoryValue = Math.floor(getMemoryUsagePercentage());
  sendMetricToGrafana('cpu', cpuValue, 'gauge', '%');
  sendMetricToGrafana('memory', memoryValue, 'gauge', '%');
  
  // HTTP request metrics
  sendMetricToGrafana('requests', requests, 'sum', '1');
  sendMetricToGrafana('get_requests', getRequests, 'sum', '1');
  sendMetricToGrafana('post_requests', postRequests, 'sum', '1');
  sendMetricToGrafana('put_requests', putRequests, 'sum', '1');
  sendMetricToGrafana('delete_requests', deleteRequests, 'sum', '1');
  requests = 0;
  getRequests = 0;
  postRequests = 0;
  putRequests = 0;
  deleteRequests = 0;
  
  // Latency metric
  sendMetricToGrafana('latency', latency, 'sum', 'ms');
  latency = 0;
  
  // Pizza-related metrics
  sendMetricToGrafana('pizza_sold', pizzaSold, 'sum', '1');
  sendMetricToGrafana('pizza_creation_failures', pizzaCreationFailures, 'sum', '1');
  sendMetricToGrafana('pizza_revenue', pizzaRevenue, 'sum', 'USD');
  pizzaSold = 0;
  pizzaCreationFailures = 0;
  pizzaRevenue = 0;
  
  // Authentication metrics
  sendMetricToGrafana('auth_attempts', authAttempts, 'sum', '1');
  sendMetricToGrafana('auth_success', authSuccess, 'sum', '1');
  sendMetricToGrafana('auth_fail', authFailure, 'sum', '1');
  authAttempts = 0;
  authSuccess = 0;
  authFailure = 0;
  
}, 1000);

// Function to send metrics to Grafana
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
    metric.resourceMetrics[0].scopeMetrics[0].metrics[0][type].aggregationTemporality = 'AGGREGATION_TEMPORALITY_CUMULATIVE';
    metric.resourceMetrics[0].scopeMetrics[0].metrics[0][type].isMonotonic = true;
  }

  const body = JSON.stringify(metric);
  fetch(`${config.url}`, {
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
          console.error(`Failed to push metrics data to Grafana: ${text}\n${body}`);
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
};
