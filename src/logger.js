// logger.js
const PizzaLogger = require('pizza-logger');
const config = require('./config.js');

console.log('Logging config:', config);

const logger = new PizzaLogger(config);

module.exports = logger;
