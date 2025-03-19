const config = require('./config');
const os = require('os');

let totalRequests = 0;
let getRequests = 0;
let postRequests = 0;
let putRequests = 0;
let deleteRequests = 0;
let activeUsers = 0;
let successfulAuthAttempts = 0;
let failedAuthAttempts = 0;
let soldPizzas = 0;
let failedPizzas = 0;
let totalRevenue = 0.0;
let serviceLatency = 0;
let pizzaLatency = 0;

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

// Track authentication attempts
function trackAuthAttempts(req, res, next) {
    if (req.method === 'PUT' && req.url === '/api/auth') {
      // Capture the response to determine success or failure
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
  
  // Send authentication attempts to Grafana every minute
  setInterval(() => {
    sendMetricToGrafana('successful_auth_attempts', successfulAuthAttempts, 'sum', '1');
    sendMetricToGrafana('failed_auth_attempts', failedAuthAttempts, 'sum', '1');
  
    // Reset counters every minute
    successfulAuthAttempts = 0;
    failedAuthAttempts = 0;
  }, 60000);

function trackPizzaMetrics(req, res, next) {
    if (req.method === 'POST' && req.url === '/api/order') {
        const start = Date.now();

        res.on('finish', () => {
            const latency = Date.now() - start;
            if (res.statusCode === 200) {
                try {
                    const order = JSON.parse(res.locals.body).order;
                    if (order) {
                        const pizzasOrdered = order.items.length;
                        soldPizzas += pizzasOrdered;
                        const orderRevenue = order.items.reduce((sum, item) => sum + item.price, 0);
                        totalRevenue += orderRevenue;
                        sendMetricToGrafana('pizza_creation_latency', latency, 'gauge', 'ms');
                    }
                } catch (error) {
                    console.error("Error parsing order response:", error);
                    failedPizzas++;
                }
            } else {
                failedPizzas++;
            }
        });
    }
    next();
}

setInterval(() => {
    sendMetricToGrafana('sold_pizzas', soldPizzas, 'sum', '1');
    sendMetricToGrafana('failed_pizzas', failedPizzas, 'sum', '1');
    sendMetricToGrafana('revenue', totalRevenue, 'sum', '$');
}, 60000);


//Track Request Latency
function trackLatency(req, res, next) {
    const start = Date.now();
    res.on('finish', () => {
        serviceLatency = Date.now() - start;
    });
    next();
}

//Track Pizza Creation Latency
function trackPizzaLatency(req, res, next) {
    if (req.method === 'POST' && req.url === '/api/order') {
        const start = Date.now();
        res.on('finish', () => {
            if (res.statusCode === 200) {
                pizzaLatency = Date.now() - start;
            }
        });
    }
    next();
}

setInterval(() => {
    sendMetricToGrafana('service_latency', serviceLatency, 'gauge', 'ms');
    sendMetricToGrafana('pizza_creation_latency', pizzaLatency, 'gauge', 'ms');

    serviceLatency = 0;
    pizzaLatency = 0;
}, 60000);


// Send metric to Grafana
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
  trackAuthAttempts,
  trackPizzaMetrics,
  trackLatency,
  trackPizzaLatency
};
