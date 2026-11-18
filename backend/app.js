const express = require('express');
const { sql, settings, getPool } = require('./db');
const { HttpError, errorHandler } = require('./errors');
const v = require('./validation');
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));

const roomSelect = `
  SELECT r.RoomID, r.RoomNumber, r.PricePerNight, r.Status,
         r.CategoryID, r.Description, c.CategoryName
  FROM dbo.Rooms r LEFT JOIN dbo.RoomCategories c ON c.CategoryID = r.CategoryID`;

app.get('/api/rooms', async (req, res) => {
  const result = await (await getPool()).request().query(roomSelect + ' ORDER BY r.RoomID');
  res.json(result.recordset);
});

app.get('/api/rooms/max-booking', async (req, res) => {
  const roomNumber = v.text(req.query.roomNumber, 'roomNumber', 10);
  const result = await (await getPool()).request()
    .input('RoomNumber', sql.VarChar(10), roomNumber)
    .query('SELECT * FROM dbo.fn_GetMaxBookingByRoom(@RoomNumber)');
  res.json(result.recordset);
});

app.get('/api/rooms/cheaper-than', async (req, res) => {
  const price = v.amount(req.query.maxPrice, 'maxPrice');
  const result = await (await getPool()).request().input('MaxPrice', sql.Float, price)
    .query('SELECT * FROM dbo.fn_GetRoomsCheaperThan(@MaxPrice) ORDER BY RoomID');
  res.json(result.recordset);
});

app.get('/api/rooms/:id', async (req, res) => {
  const id = v.positiveInt(req.params.id, 'id');
  const result = await (await getPool()).request().input('RoomID', sql.Int, id)
    .query(roomSelect + ` WHERE r.RoomID = @RoomID;
      SELECT BookingID, GuestName, RoomID, CheckInDate, NightsCount, TotalPrice
      FROM dbo.Bookings WHERE RoomID = @RoomID ORDER BY BookingID;`);
  if (!result.recordsets[0].length) throw new HttpError(404, 'NOT_FOUND', 'Room was not found.');
  res.json({ ...result.recordsets[0][0], bookings: result.recordsets[1] });
});

app.get('/api/bookings', async (req, res) => {
  const result = await (await getPool()).request().query(`
    SELECT b.BookingID, b.GuestName, b.RoomID, r.RoomNumber,
           b.CheckInDate, b.NightsCount, b.TotalPrice
    FROM dbo.Bookings b LEFT JOIN dbo.Rooms r ON r.RoomID = b.RoomID
    ORDER BY b.BookingID`);
  res.json(result.recordset);
});

app.get('/api/staff', async (req, res) => {
  const result = await (await getPool()).request().query(`
    SELECT s.StaffID, s.Name, s.CategoryID, s.Information, c.CategoryName
    FROM dbo.Staff s LEFT JOIN dbo.RoomCategories c ON c.CategoryID = s.CategoryID
    ORDER BY s.StaffID`);
  res.json(result.recordset);
});

async function testDatabaseOnly(req, res, next) {
  const same = (a, b) => a.toLowerCase() === b.toLowerCase();
  if (!settings.enableTestWrites || !settings.testDatabase || !settings.testServer ||
      same(settings.database, 'HotelDB') || !same(settings.database, settings.testDatabase)) {
    throw new HttpError(403, 'WRITES_DISABLED', 'Writes require an explicitly approved disposable test database. HotelDB is read-only in this API.');
  }

  const pool = await getPool();
  const identity = (await pool.request().query(
    'SELECT DB_NAME() AS databaseName, CONVERT(nvarchar(128), SERVERPROPERTY(\'ServerName\')) AS serverName'
  )).recordset[0];

  if (!same(identity.databaseName, settings.testDatabase) || same(identity.databaseName, 'HotelDB') ||
      !same(identity.serverName, settings.testServer)) {
    throw new HttpError(403, 'TEST_DATABASE_MISMATCH', 'Connected database/server does not match the confirmed disposable test target.');
  }
  req.dbPool = pool;
  next();
}

app.post('/api/staff/cleanup', testDatabaseOnly, async (req, res) => {
  const revenue = v.amount(v.body(req).minTotalRevenue, 'minTotalRevenue');
  await req.dbPool.request().input('MinTotalRevenue', sql.Float, revenue)
    .execute('dbo.usp_DeleteStaffByLowRevenue');
  res.json({ message: 'Staff cleanup procedure completed.' });
});

app.post('/api/bookings', testDatabaseOnly, async (req, res) => {
  const input = v.body(req);
  const guest = v.text(input.guestName, 'guestName', 50);
  const room = v.positiveInt(input.roomId, 'roomId');
  const checkIn = v.date(input.checkInDate);
  const nights = v.positiveInt(input.nightsCount, 'nightsCount');
  const total = v.amount(input.totalPrice, 'totalPrice');
  
  await req.dbPool.request()
    .input('GuestName', sql.VarChar(50), guest).input('RoomID', sql.Int, room)
    .input('CheckInDate', sql.Date, checkIn).input('NightsCount', sql.Int, nights)
    .input('TotalPrice', sql.Float, total)
    .query(`SET DATEFIRST 7;
      INSERT INTO dbo.Bookings (GuestName, RoomID, CheckInDate, NightsCount, TotalPrice)
      VALUES (@GuestName, @RoomID, @CheckInDate, @NightsCount, @TotalPrice);`);
  res.status(201).json({ message: 'Booking submitted successfully.' });
});

app.use((req, res, next) => next(new HttpError(404, 'NOT_FOUND', 'API route was not found.')));
app.use(errorHandler);
module.exports = app;