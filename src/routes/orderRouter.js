const express = require('express');
const config = require('../config.js');
const { Role, DB } = require('../database/database.js');
const { authRouter } = require('./authRouter.js');
const { asyncHandler, StatusCodeError } = require('../endpointHelper.js');

// Import the sendMetricToGrafana function
const{ sendMetricToGrafana } = require('../metrics.js');
let soldPizzas = 0;
let failedPizzas = 0;
let totalRevenue = 0.0;

const orderRouter = express.Router();

orderRouter.endpoints = [
  {
    method: 'GET',
    path: '/api/order/menu',
    description: 'Get the pizza menu',
    example: `curl localhost:3000/api/order/menu`,
    response: [{ id: 1, title: 'Veggie', image: 'pizza1.png', price: 0.0038, description: 'A garden of delight' }],
  },
  {
    method: 'PUT',
    path: '/api/order/menu',
    requiresAuth: true,
    description: 'Add an item to the menu',
    example: `curl -X PUT localhost:3000/api/order/menu -H 'Content-Type: application/json' -d '{ "title":"Student", "description": "No topping, no sauce, just carbs", "image":"pizza9.png", "price": 0.0001 }'  -H 'Authorization: Bearer tttttt'`,
    response: [{ id: 1, title: 'Student', description: 'No topping, no sauce, just carbs', image: 'pizza9.png', price: 0.0001 }],
  },
  {
    method: 'GET',
    path: '/api/order',
    requiresAuth: true,
    description: 'Get the orders for the authenticated user',
    example: `curl -X GET localhost:3000/api/order  -H 'Authorization: Bearer tttttt'`,
    response: { dinerId: 4, orders: [{ id: 1, franchiseId: 1, storeId: 1, date: '2024-06-05T05:14:40.000Z', items: [{ id: 1, menuId: 1, description: 'Veggie', price: 0.05 }] }], page: 1 },
  },
  {
    method: 'POST',
    path: '/api/order',
    requiresAuth: true,
    description: 'Create a order for the authenticated user',
    example: `curl -X POST localhost:3000/api/order -H 'Content-Type: application/json' -d '{"franchiseId": 1, "storeId":1, "items":[{ "menuId": 1, "description": "Veggie", "price": 0.05 }]}'  -H 'Authorization: Bearer tttttt'`,
    response: { order: { franchiseId: 1, storeId: 1, items: [{ menuId: 1, description: 'Veggie', price: 0.05 }], id: 1 }, jwt: '1111111111' },
  },
];

// getMenu
orderRouter.get(
  '/menu',
  asyncHandler(async (req, res) => {
    res.send(await DB.getMenu());
  })
);

// addMenuItem
orderRouter.put(
  '/menu',
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    if (!req.user.isRole(Role.Admin)) {
      throw new StatusCodeError('unable to add menu item', 403);
    }

    const addMenuItemReq = req.body;
    await DB.addMenuItem(addMenuItemReq);
    res.send(await DB.getMenu());
  })
);

// getOrders
orderRouter.get(
  '/',
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    res.json(await DB.getOrders(req.user, req.query.page));
  })
);

// createOrder
orderRouter.post(
  '/',
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    const orderReq = req.body;
    let order;
    try {
      order = await DB.addDinerOrder(req.user, orderReq);
    } catch (error) {
      // If order creation fails, count as a failed pizza order
      failedPizzas++;
      sendMetricToGrafana('failed_pizzas', failedPizzas, 'sum', '1');
      throw error;
    }

    // Start timing for pizza creation latency
    const startTime = Date.now();

    let factoryResponse;
    try {
      factoryResponse = await fetch(`${config.factory.url}/api/order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${config.factory.apiKey}`,
        },
        body: JSON.stringify({
          diner: { id: req.user.id, name: req.user.name, email: req.user.email },
          order,
        }),
      });
    } catch (error) {
      // If the factory call fails, update failure metric and return an error
      failedPizzas++;
      sendMetricToGrafana('failed_pizzas', failedPizzas, 'sum', '1');
      console.error("Error contacting factory:", error);
      return res.status(500).send({ message: 'Failed to connect to factory' });
    }

    // Calculate and send pizza creation latency
    const pizzaLatency = Date.now() - startTime;
    sendMetricToGrafana('pizza_creation_latency', pizzaLatency, 'gauge', 'ms');

    const factoryData = await factoryResponse.json();

    if (factoryResponse.ok) {
      // Update metrics for sold pizzas and revenue
      const pizzasOrdered = order.items.length;
      soldPizzas += pizzasOrdered;
      const orderRevenue = order.items.reduce((sum, item) => sum + item.price, 0);
      totalRevenue += orderRevenue;

      sendMetricToGrafana('sold_pizzas', soldPizzas, 'sum', '1');
      sendMetricToGrafana('revenue', totalRevenue, 'sum', '$');

      return res.send({
        order,
        reportSlowPizzaToFactoryUrl: factoryData.reportUrl,
        jwt: factoryData.jwt,
      });
    } else {
      failedPizzas++;
      sendMetricToGrafana('failed_pizzas', failedPizzas, 'sum', '1');
      return res.status(500).send({
        message: 'Failed to fulfill order at factory',
        reportPizzaCreationErrorToPizzaFactoryUrl: factoryData.reportUrl,
      });
    }
  })
);

module.exports = orderRouter;
