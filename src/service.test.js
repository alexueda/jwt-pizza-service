const request = require('supertest');
const app = require('./service');
const jwt = require('jsonwebtoken');
const config = require('./config');

const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
let testUserAuthToken;

beforeAll(async () => {
  testUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';
  const registerRes = await request(app).post('/api/auth').send(testUser);
  testUserAuthToken = registerRes.body.token;
});

test('login', async () => {
  const loginRes = await request(app).put('/api/auth').send(testUser);
  expect(loginRes.status).toBe(200);
  expect(loginRes.body.token).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);

  const { password, ...user } = { ...testUser, roles: [{ role: 'diner' }] };
  expect(loginRes.body.user).toMatchObject(user);
});

test('GET / should return welcome message and version', async () => {
  const res = await request(app).get('/');
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('message', 'welcome to JWT Pizza');
  expect(res.body).toHaveProperty('version');
});

test('GET /api/docs should return API documentation', async () => {
  const res = await request(app).get('/api/docs');
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('version');
  expect(res.body).toHaveProperty('endpoints');
  expect(res.body).toHaveProperty('config');
  expect(res.body.config).toHaveProperty('factory');
  expect(res.body.config).toHaveProperty('db');
});

test('Unknown endpoint should return 404', async () => {
  const res = await request(app).get('/nonexistent');
  expect(res.status).toBe(404);
  expect(res.body).toHaveProperty('message', 'unknown endpoint');
});

test('CORS headers are set correctly', async () => {
  const origin = 'http://example.com';
  const res = await request(app)
    .get('/')
    .set('Origin', origin);
  expect(res.headers['access-control-allow-origin']).toBe(origin);
  expect(res.headers['access-control-allow-methods']).toBe('GET, POST, PUT, DELETE');
  expect(res.headers['access-control-allow-headers']).toBe('Content-Type, Authorization');
  expect(res.headers['access-control-allow-credentials']).toBe('true');
});

test('Malformed JSON should trigger error handler', async () => {
  const res = await request(app)
    .post('/api/auth')
    .set('Content-Type', 'application/json')
    .send('{"invalidJson":');
  expect(res.status).not.toBe(200);
  expect(res.body).toHaveProperty('message');
  expect(res.body).toHaveProperty('stack');
});

//Database tests
describe('Database Module', () => {
  let fakeConnection;
  let DB;

  beforeEach(() => {
    // Create a fake connection object that simulates MySQL methods.
    fakeConnection = {
      execute: jest.fn(),
      end: jest.fn().mockResolvedValue(),
      beginTransaction: jest.fn().mockResolvedValue(),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
    };
    fakeConnection.query = fakeConnection.execute;

    DB = require('./database/database').DB;
    DB._getConnection = jest.fn().mockResolvedValue(fakeConnection);
    DB.getConnection = jest.fn().mockResolvedValue(fakeConnection);
  });

  test('getMenu returns rows', async () => {
    fakeConnection.execute.mockResolvedValue([[{ id: 1, title: 'Pizza' }]]);
    const menu = await DB.getMenu();
    expect(menu).toEqual([{ id: 1, title: 'Pizza' }]);
    expect(fakeConnection.end).toHaveBeenCalled();
  });

  test('addMenuItem returns item with id', async () => {
    fakeConnection.execute.mockResolvedValue([{ insertId: 101 }]);
    const item = { title: 'Test Item', description: 'desc', image: 'img.png', price: 9.99 };
    const result = await DB.addMenuItem(item);
    expect(result).toMatchObject({ id: 101, ...item });
    expect(fakeConnection.end).toHaveBeenCalled();
  });


  test('loginUser inserts token into auth table', async () => {
    fakeConnection.execute.mockResolvedValueOnce([{}]);
    await DB.loginUser(501, 'header.payload.signature');
    expect(fakeConnection.end).toHaveBeenCalled();
  });

  test('isLoggedIn returns true when token exists', async () => {
    fakeConnection.execute.mockResolvedValueOnce([[{ userId: 601 }]]);
    const result = await DB.isLoggedIn('header.payload.signature');
    expect(result).toBe(true);
    expect(fakeConnection.end).toHaveBeenCalled();
  });

  test('isLoggedIn returns false when token does not exist', async () => {
    fakeConnection.execute.mockResolvedValueOnce([[]]);
    const result = await DB.isLoggedIn('header.payload.signature');
    expect(result).toBe(false);
    expect(fakeConnection.end).toHaveBeenCalled();
  });

  test('logoutUser deletes token from auth', async () => {
    fakeConnection.execute.mockResolvedValueOnce([{}]);
    await DB.logoutUser('header.payload.signature');
    expect(fakeConnection.end).toHaveBeenCalled();
  });

  test('getOrders returns orders with items', async () => {
    fakeConnection.execute.mockResolvedValueOnce([[
      { id: 701, franchiseId: 1, storeId: 1, date: '2020-01-01' }
    ]]);
    fakeConnection.execute.mockResolvedValueOnce([[
      { id: 801, menuId: 10, description: 'item', price: 5 }
    ]]);
    const user = { id: 1001 };
    const result = await DB.getOrders(user, 1);
    expect(result).toHaveProperty('dinerId', user.id);
    expect(result.orders[0]).toHaveProperty('items');
    expect(fakeConnection.end).toHaveBeenCalled();
  });

  test('addDinerOrder returns order with new id', async () => {
    fakeConnection.execute.mockResolvedValueOnce([{ insertId: 901 }]);
    fakeConnection.execute.mockResolvedValue([{ }]);
    fakeConnection.execute.mockResolvedValueOnce([[{ id: 10 }]]);
    const user = { id: 1001 };
    const order = { franchiseId: 1, storeId: 1, items: [{ menuId: 5, description: 'desc', price: 3.5 }] };
    const result = await DB.addDinerOrder(user, order);
    expect(result).toHaveProperty('id', 901);
    expect(fakeConnection.end).toHaveBeenCalled();
  });

  test('createFranchise returns franchise with id and sets admin roles', async () => {
    fakeConnection.execute.mockResolvedValueOnce([[{ id: 1101, name: 'Admin', email: 'admin@test.com' }]]);
    fakeConnection.execute.mockResolvedValueOnce([{ insertId: 1201 }]);
    fakeConnection.execute.mockResolvedValueOnce([{}]);
    const franchise = { name: 'Test Franchise', admins: [{ email: 'admin@test.com' }] };
    const result = await DB.createFranchise(franchise);
    expect(result).toHaveProperty('id', 1201);
    expect(result.admins[0]).toHaveProperty('id', 1101);
    expect(fakeConnection.end).toHaveBeenCalled();
  });

  test('deleteFranchise commits transaction on success', async () => {
    fakeConnection.beginTransaction.mockResolvedValue();
    fakeConnection.commit.mockResolvedValue();
    fakeConnection.execute.mockResolvedValue([{}]);
    await DB.deleteFranchise(1301);
    expect(fakeConnection.beginTransaction).toHaveBeenCalled();
    expect(fakeConnection.commit).toHaveBeenCalled();
    expect(fakeConnection.end).toHaveBeenCalled();
  });

  test('deleteFranchise rolls back transaction on failure', async () => {
    fakeConnection.beginTransaction.mockResolvedValue();
    fakeConnection.execute.mockRejectedValueOnce(new Error('fail'));
    fakeConnection.rollback.mockResolvedValue();
    await expect(DB.deleteFranchise(1302)).rejects.toThrow('unable to delete franchise');
    expect(fakeConnection.rollback).toHaveBeenCalled();
    expect(fakeConnection.end).toHaveBeenCalled();
  });

  test('getFranchises returns franchises and calls getFranchise for admin', async () => {
    fakeConnection.execute.mockResolvedValueOnce([[
      { id: 1401, name: 'Franchise1' }
    ]]);
    fakeConnection.execute.mockResolvedValueOnce([[
      { id: 1, name: 'Admin', email: 'admin@test.com' }
    ]]);
    fakeConnection.execute.mockResolvedValueOnce([[
      { id: 201, name: 'Store1', totalRevenue: 100 }
    ]]);
    const authUser = { isRole: jest.fn(() => true) };
    const result = await DB.getFranchises(authUser);
    expect(result[0]).toHaveProperty('id', 1401);
    expect(fakeConnection.end).toHaveBeenCalled();
  });

  test('getUserFranchises returns empty array if no roles found', async () => {
    fakeConnection.execute.mockResolvedValueOnce([[]]);
    const result = await DB.getUserFranchises(1501);
    expect(result).toEqual([]);
    expect(fakeConnection.end).toHaveBeenCalled();
  });

  test('getUserFranchises returns franchises when roles exist', async () => {
    fakeConnection.execute.mockResolvedValueOnce([[{ objectId: 1601 }]]);
    fakeConnection.execute.mockResolvedValueOnce([[
      { id: 1601, name: 'FranchiseX' }
    ]]);
    fakeConnection.execute.mockResolvedValueOnce([[
      { id: 1, name: 'Admin', email: 'admin@test.com' }
    ]]);
    fakeConnection.execute.mockResolvedValueOnce([[
      { id: 201, name: 'Store1', totalRevenue: 100 }
    ]]);
    const result = await DB.getUserFranchises(1701);
    expect(result[0]).toHaveProperty('id', 1601);
    expect(fakeConnection.end).toHaveBeenCalled();
  });

  test('getFranchise returns franchise with admins and stores', async () => {
    fakeConnection.execute.mockResolvedValueOnce([[
      { id: 1701, name: 'Admin', email: 'admin@test.com' }
    ]]);
    fakeConnection.execute.mockResolvedValueOnce([[
      { id: 2701, name: 'Store1', totalRevenue: 100 }
    ]]);
    const franchise = { id: 1801, name: 'Test Franchise' };
    const result = await DB.getFranchise(franchise);
    expect(result).toHaveProperty('admins');
    expect(result).toHaveProperty('stores');
    expect(fakeConnection.end).toHaveBeenCalled();
  });

  test('createStore returns store with id', async () => {
    fakeConnection.execute.mockResolvedValueOnce([{ insertId: 1901 }]);
    const store = { name: 'Test Store' };
    const result = await DB.createStore(2001, store);
    expect(result).toMatchObject({ id: 1901, franchiseId: 2001, name: 'Test Store' });
    expect(fakeConnection.end).toHaveBeenCalled();
  });

  test('deleteStore deletes the store', async () => {
    fakeConnection.execute.mockResolvedValueOnce([{}]);
    await DB.deleteStore(2101, 2201);
    expect(fakeConnection.end).toHaveBeenCalled();
  });

  test('getOffset returns correct offset', () => {
    const offset = DB.getOffset(2, 10);
    expect(offset).toBe((2 - 1) * 10);
  });

  test('getTokenSignature returns the signature part of a token', () => {
    const token = 'header.payload.signature';
    const signature = DB.getTokenSignature(token);
    expect(signature).toBe('signature');
  });

  test('getID returns id if found', async () => {
    fakeConnection.execute.mockResolvedValueOnce([[{ id: 2301 }]]);
    const id = await DB.getID(fakeConnection, 'name', 'value', 'table');
    expect(id).toBe(2301);
  });

  test('getID throws error if no id found', async () => {
    fakeConnection.execute.mockResolvedValueOnce([[]]);
    await expect(DB.getID(fakeConnection, 'name', 'value', 'table')).rejects.toThrow('No ID found');
  });

  test('checkDatabaseExists returns true if the database exists', async () => {
    fakeConnection.execute.mockResolvedValueOnce([[{ SCHEMA_NAME: 'testdb' }]]);
    const exists = await DB.checkDatabaseExists(fakeConnection);
    expect(exists).toBe(true);
  });
});

//Routes tests

describe('Routes Tests', () => {
  const { DB, Role } = require('./database/database');

  beforeEach(() => {
    DB.addUser = jest.fn();
    DB.getUser = jest.fn();
    DB.loginUser = jest.fn();
    DB.logoutUser = jest.fn();
    DB.updateUser = jest.fn();
    DB.isLoggedIn = jest.fn().mockResolvedValue(true);
    DB.getFranchises = jest.fn();
    DB.getUserFranchises = jest.fn();
    DB.createFranchise = jest.fn();
    DB.deleteFranchise = jest.fn();
    DB.getFranchise = jest.fn();
    DB.createStore = jest.fn();
    DB.deleteStore = jest.fn();
    DB.getMenu = jest.fn();
    DB.addMenuItem = jest.fn();
    DB.getOrders = jest.fn();
    DB.addDinerOrder = jest.fn();
  });

  //Auth Routes
  describe('Auth Routes', () => {
    test('POST /api/auth registers a new user', async () => {
      const newUser = { name: 'Route Test', email: 'route@test.com', password: 'secret' };
      const fakeUser = { id: 100, name: newUser.name, email: newUser.email, roles: [{ role: Role.Diner }], password: undefined };
      DB.addUser.mockResolvedValue(fakeUser);
      DB.loginUser.mockResolvedValue();
      const res = await request(app).post('/api/auth').send(newUser);
      expect(res.status).toBe(200);
      expect(res.body.user).toEqual(fakeUser);
      expect(typeof res.body.token).toBe('string');
    });

    test('PUT /api/auth logs in a user', async () => {
      const creds = { email: 'route@test.com', password: 'secret' };
      const fakeUser = { id: 100, name: 'Route Test', email: creds.email, roles: [{ role: Role.Diner }], password: undefined };
      DB.getUser.mockResolvedValue(fakeUser);
      DB.loginUser.mockResolvedValue();
      const res = await request(app).put('/api/auth').send(creds);
      expect(res.status).toBe(200);
      expect(res.body.user).toEqual(fakeUser);
      expect(typeof res.body.token).toBe('string');
    });

    test('DELETE /api/auth logs out a user', async () => {
      DB.logoutUser.mockResolvedValue();
      const fakeUser = { id: 100, name: 'Route Test', email: 'route@test.com', roles: [{ role: Role.Diner }] };
      const token = jwt.sign(fakeUser, config.jwtSecret);
      const res = await request(app).delete('/api/auth').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('logout successful');
    });

    test('PUT /api/auth/:userId returns 403 if unauthorized', async () => {
      const fakeUser = { id: 100, name: 'Route Test', email: 'route@test.com', roles: [{ role: Role.Diner }], isRole: () => false };
      const token = jwt.sign(fakeUser, config.jwtSecret);
      const res = await request(app)
        .put('/api/auth/101')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'new@example.com', password: 'new' });
      expect(res.status).toBe(403);
    });

    test('PUT /api/auth/:userId updates user info when authorized', async () => {
      const fakeUser = { id: 100, name: 'Route Test', email: 'route@test.com', roles: [{ role: Role.Diner }], isRole: (r) => r === Role.Diner };
      const token = jwt.sign(fakeUser, config.jwtSecret);
      const updatedUser = { id: 100, name: 'Route Test', email: 'updated@example.com', roles: [{ role: Role.Diner }] };
      DB.updateUser.mockResolvedValue(updatedUser);
      const res = await request(app)
        .put('/api/auth/100')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'updated@example.com', password: 'new' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual(updatedUser);
    });
  });

  //Franchise Routes
  describe('Franchise Routes', () => {
    test('GET /api/franchise returns franchises', async () => {
      const franchises = [{ id: 1, name: 'Franchise A' }];
      DB.getFranchises.mockResolvedValue(franchises);
      const res = await request(app).get('/api/franchise');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(franchises);
    });

    test('GET /api/franchise/:userId returns user franchises', async () => {
      const userFranchises = [{ id: 2, name: 'Franchise B' }];
      DB.getUserFranchises.mockResolvedValue(userFranchises);
      const fakeUser = { id: 200, name: 'User', email: 'user@example.com', roles: [{ role: Role.Admin }], isRole: (r) => r === Role.Admin };
      const token = jwt.sign(fakeUser, config.jwtSecret);
      const res = await request(app).get('/api/franchise/200').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(userFranchises);
    });

    test('POST /api/franchise returns 403 for non-admin', async () => {
      const fakeUser = { id: 300, name: 'NonAdmin', email: 'nonadmin@example.com', roles: [{ role: Role.Diner }], isRole: () => false };
      const token = jwt.sign(fakeUser, config.jwtSecret);
      const res = await request(app)
        .post('/api/franchise')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Franchise New' });
      expect(res.status).toBe(403);
    });

    test('POST /api/franchise creates a franchise for admin', async () => {
      const fakeUser = { id: 400, name: 'Admin', email: 'admin@example.com', roles: [{ role: Role.Admin }], isRole: (r) => r === Role.Admin };
      const token = jwt.sign(fakeUser, config.jwtSecret);
      const newFranchise = { name: 'Franchise New' };
      const createdFranchise = { id: 10, name: 'Franchise New', admins: [{ id: 400, name: 'Admin', email: 'admin@example.com' }] };
      DB.createFranchise.mockResolvedValue(createdFranchise);
      const res = await request(app)
        .post('/api/franchise')
        .set('Authorization', `Bearer ${token}`)
        .send(newFranchise);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(createdFranchise);
    });

    test('DELETE /api/franchise/:franchiseId deletes a franchise', async () => {
      DB.deleteFranchise.mockResolvedValue();
      const fakeUser = { id: 400, name: 'Admin', email: 'admin@example.com', roles: [{ role: Role.Admin }], isRole: (r) => r === Role.Admin };
      const token = jwt.sign(fakeUser, config.jwtSecret);
      const res = await request(app).delete('/api/franchise/10').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('franchise deleted');
    });

    test('POST /api/franchise/:franchiseId/store returns 403 for unauthorized user', async () => {
      const fakeUser = { id: 500, name: 'User', email: 'user@example.com', roles: [{ role: Role.Diner }], isRole: () => false };
      const token = jwt.sign(fakeUser, config.jwtSecret);
      DB.getFranchise.mockResolvedValue({ id: 1, name: 'Franchise A', admins: [{ id: 400, name: 'Admin', email: 'admin@example.com' }] });
      const res = await request(app)
        .post('/api/franchise/1/store')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Store X' });
      expect(res.status).toBe(403);
    });

    test('POST /api/franchise/:franchiseId/store creates a store for authorized user', async () => {
      const fakeUser = { id: 400, name: 'Admin', email: 'admin@example.com', roles: [{ role: Role.Admin }], isRole: (r) => r === Role.Admin };
      const token = jwt.sign(fakeUser, config.jwtSecret);
      DB.getFranchise.mockResolvedValue({ id: 1, name: 'Franchise A', admins: [{ id: 400, name: 'Admin', email: 'admin@example.com' }] });
      const newStore = { name: 'Store X' };
      const createdStore = { id: 20, franchiseId: 1, name: 'Store X', totalRevenue: 0 };
      DB.createStore.mockResolvedValue(createdStore);
      const res = await request(app)
        .post('/api/franchise/1/store')
        .set('Authorization', `Bearer ${token}`)
        .send(newStore);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(createdStore);
    });
  });
});