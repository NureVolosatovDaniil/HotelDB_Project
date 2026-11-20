const express = require('express');
const { sql, getPool } = require('./db');
const { HttpError, errorHandler } = require('./errors');
const v = require('./validation');
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));

const roomSelect = `
  SELECT r.RoomID, r.RoomNumber, r.PricePerNight, r.Status AS StoredStatus,
         CASE WHEN EXISTS (
           SELECT 1 FROM dbo.Bookings b
           WHERE b.RoomID = r.RoomID
             AND COALESCE(@OccupancyDate, CONVERT(date, GETDATE())) >= b.CheckInDate
             AND COALESCE(@OccupancyDate, CONVERT(date, GETDATE())) < DATEADD(day, b.NightsCount, b.CheckInDate)
         ) THEN 'Occupied' ELSE 'Free' END AS Status,
         r.CategoryID, r.Description, c.CategoryName
  FROM dbo.Rooms r LEFT JOIN dbo.RoomCategories c ON c.CategoryID = r.CategoryID`;

app.get('/api/rooms', async (req, res) => {
  const occupancyDate = req.query.date === undefined ? null : v.date(req.query.date, 'date');
  const result = await (await getPool()).request().input('OccupancyDate', sql.Date, occupancyDate)
    .query(roomSelect + ' ORDER BY r.RoomID');
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


app.get('/api/categories', async (req, res) => {
  const result = await (await getPool()).request()
    .query('SELECT CategoryID, CategoryName FROM dbo.RoomCategories ORDER BY CategoryID');
  res.json(result.recordset);
});

app.get('/api/rooms/booking-count', async (req, res) => {
  const roomNumber = v.text(req.query.roomNumber, 'roomNumber', 10);
  const result = await (await getPool()).request().input('RoomNumber', sql.VarChar(10), roomNumber)
    .query('SELECT dbo.fn_GetBookingCountByRoom(@RoomNumber) AS BookingCount');
  res.json({ count: result.recordset[0].BookingCount });
});


app.get('/api/rooms/:id', async (req, res) => {
  const id = v.positiveInt(req.params.id, 'id');
  const occupancyDate = req.query.date === undefined ? null : v.date(req.query.date, 'date');
  const result = await (await getPool()).request().input('RoomID', sql.Int, id)
    .input('OccupancyDate', sql.Date, occupancyDate)
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


const input = require('./crud');

function requireChanged(result) {
  if (!result.recordset.length) throw new HttpError(404, 'NOT_FOUND', 'Record was not found.');
}

app.post('/api/rooms', async (req, res) => {
  const data = v.body(req);
  const request = input.room(new sql.Request(), data);
  const pool = await getPool();
  request.parent = pool;
  const result = await request.query(`
    INSERT INTO dbo.Rooms (RoomNumber, PricePerNight, Status, CategoryID, Description)
    OUTPUT inserted.RoomID
    VALUES (@RoomNumber, @PricePerNight, @Status, @CategoryID, @Description)`);
  res.status(201).json({ message: 'Room added.', roomId: result.recordset[0].RoomID });
});

app.put('/api/rooms/:id', async (req, res) => {
  const id = v.positiveInt(req.params.id, 'id');
  const request = input.room(new sql.Request(), v.body(req)).input('ID', sql.Int, id);
  request.parent = await getPool();
  const result = await request.query(`
    UPDATE dbo.Rooms SET RoomNumber=@RoomNumber, PricePerNight=@PricePerNight,
      Status=@Status, CategoryID=@CategoryID, Description=@Description
    OUTPUT inserted.RoomID WHERE RoomID=@ID`);
  requireChanged(result);
  res.json({ message: 'Room updated.' });
});

app.delete('/api/rooms/:id', async (req, res) => {
  const id = v.positiveInt(req.params.id, 'id');
  const result = await (await getPool()).request().input('ID', sql.Int, id)
    .query('DELETE FROM dbo.Rooms OUTPUT deleted.RoomID WHERE RoomID=@ID');
  requireChanged(result);
  res.json({ message: 'Room deleted.' });
});

app.post('/api/staff/cleanup', async (req, res) => {
  const revenue = v.amount(v.body(req).minTotalRevenue, 'minTotalRevenue');
  await (await getPool()).request().input('MinTotalRevenue', sql.Float, revenue)
    .execute('dbo.usp_DeleteStaffByLowRevenue');
  res.json({ message: 'Staff cleanup completed.' });
});

app.post('/api/staff', async (req, res) => {
  const request = input.staff(new sql.Request(), v.body(req));
  request.parent = await getPool();
  const result = await request.query(`
    INSERT INTO dbo.Staff (Name, CategoryID, Information) OUTPUT inserted.StaffID
    VALUES (@Name, @CategoryID, @Information)`);
  res.status(201).json({ message: 'Employee added.', staffId: result.recordset[0].StaffID });
});

app.put('/api/staff/:id', async (req, res) => {
  const id = v.positiveInt(req.params.id, 'id');
  const request = input.staff(new sql.Request(), v.body(req)).input('ID', sql.Int, id);
  request.parent = await getPool();
  const result = await request.query(`
    UPDATE dbo.Staff SET Name=@Name, CategoryID=@CategoryID, Information=@Information
    OUTPUT inserted.StaffID WHERE StaffID=@ID`);
  requireChanged(result);
  res.json({ message: 'Employee updated.' });
});

app.delete('/api/staff/:id', async (req, res) => {
  const id = v.positiveInt(req.params.id, 'id');
  const result = await (await getPool()).request().input('ID', sql.Int, id)
    .query('DELETE FROM dbo.Staff OUTPUT deleted.StaffID WHERE StaffID=@ID');
  requireChanged(result);
  res.json({ message: 'Employee deleted.' });
});

app.post('/api/bookings', async (req, res) => {
  const request = input.booking(new sql.Request(), v.body(req));
  request.parent = await getPool();
  await request.query(`SET DATEFIRST 7;
    INSERT INTO dbo.Bookings (GuestName, RoomID, CheckInDate, NightsCount, TotalPrice)
    VALUES (@GuestName, @RoomID, @CheckInDate, @NightsCount, @TotalPrice)`);
  res.status(201).json({ message: 'Booking added.' });
});

app.put('/api/bookings/:id', async (req, res) => {
  const id = v.positiveInt(req.params.id, 'id');
  const request = input.booking(new sql.Request(), v.body(req)).input('ID', sql.Int, id);
  request.parent = await getPool();
  const result = await request.query(`
    DECLARE @updated TABLE (BookingID int);
    UPDATE dbo.Bookings SET GuestName=@GuestName, RoomID=@RoomID, CheckInDate=@CheckInDate,
      NightsCount=@NightsCount, TotalPrice=@TotalPrice
    OUTPUT inserted.BookingID INTO @updated WHERE BookingID=@ID;
    SELECT BookingID FROM @updated;`);
  requireChanged(result);
  res.json({ message: 'Booking updated.' });
});

app.delete('/api/bookings/:id', async (req, res) => {
  const id = v.positiveInt(req.params.id, 'id');
  const result = await (await getPool()).request().input('ID', sql.Int, id)
    .query('DELETE FROM dbo.Bookings OUTPUT deleted.BookingID WHERE BookingID=@ID');
  requireChanged(result);
  res.json({ message: 'Booking deleted.' });
});


app.get('/api/logs/bookings', async (req, res) => {
  const result = await (await getPool()).request()
    .query('SELECT Id, BookingID, ModifyDate FROM dbo.BookingLogs ORDER BY ModifyDate DESC, Id DESC');
  res.json(result.recordset);
});

app.get('/api/logs/access-denied', async (req, res) => {
  const result = await (await getPool()).request()
    .query('SELECT LogID, AttemptDate, Message FROM dbo.AccessDeniedLogs ORDER BY AttemptDate DESC, LogID DESC');
  res.json(result.recordset);
});

app.post('/api/error-demo', async (req, res) => {
  await (await getPool()).request().execute('dbo.usp_DemoBookingError');
  res.json({ message: 'Procedure completed.' });
});

app.use((req, res, next) => next(new HttpError(404, 'NOT_FOUND', 'API route was not found.')));
app.use(errorHandler);
module.exports = app;