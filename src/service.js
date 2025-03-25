const express = require('express');
const { requestTracker, trackActiveUsers, trackAuthAttempts, trackLatency } = require('./metrics');  // Import the requestTracker and trackActiveUsers middleware
const { authRouter, setAuthUser } = require('./routes/authRouter.js');
const orderRouter = require('./routes/orderRouter.js');
const franchiseRouter = require('./routes/franchiseRouter.js');
const version = require('./version.json');
const config = require('./config.js');
const logger = require('./logger');// Import the logger module

const app = express();
app.use(express.json());
app.use(setAuthUser);

app.use(requestTracker); // Add the requestTracker middleware
app.use(trackActiveUsers); // Add the trackActiveUsers middleware
app.use(trackAuthAttempts); // Add the trackAuthAttempts middleware
app.use(trackLatency); // Add the trackLatency middleware

app.use(logger.httpLogger);// Add the httpLogger middleware

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  next();
});

const apiRouter = express.Router();
app.use('/api', apiRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/order', orderRouter);
apiRouter.use('/franchise', franchiseRouter);

apiRouter.use('/docs', (req, res) => {
  res.json({
    version: version.version,
    endpoints: [...authRouter.endpoints, ...orderRouter.endpoints, ...franchiseRouter.endpoints],
    config: { factory: config.factory.url, db: config.db.connection.host },
  });
});

app.get('/', (req, res) => {
  res.json({
    message: 'welcome to JWT Pizza',
    version: version.version,
  });
});

app.use('*', (req, res) => {
  res.status(404).json({
    message: 'unknown endpoint',
  });
});

// Default error handler for all exceptions and errors.
app.use((err, req, res, next) => {
  logger.unhandledErrorLogger(err);// Log the error
  res.status(err.statusCode ?? 500).json({ message: err.message, stack: err.stack });
  next();
});

module.exports = app;