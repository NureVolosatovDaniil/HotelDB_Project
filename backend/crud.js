const { sql } = require('./db');
const v = require('./validation');

function optionalText(value, name, max) {
  return value == null || value === '' ? null : v.text(value, name, max);
}

function relatedId(value, name) {
  return value == null || value === '' ? null : v.positiveInt(value, name);
}

function room(request, input) {
  return request.input('RoomNumber', sql.VarChar(10), v.text(input.roomNumber, 'roomNumber', 10))
    .input('PricePerNight', sql.Float, v.amount(input.pricePerNight, 'pricePerNight'))
    .input('Status', sql.VarChar(20), optionalText(input.status, 'status', 20))
    .input('CategoryID', sql.Int, relatedId(input.categoryId, 'categoryId'))
    .input('Description', sql.NVarChar(100), optionalText(input.description, 'description', 100));
}

function staff(request, input) {
  return request.input('Name', sql.VarChar(50), v.text(input.name, 'name', 50))
    .input('CategoryID', sql.Int, relatedId(input.categoryId, 'categoryId'))
    .input('Information', sql.VarChar(40), optionalText(input.information, 'information', 40));
}

function booking(request, input) {
  return request.input('GuestName', sql.VarChar(50), v.text(input.guestName, 'guestName', 50))
    .input('RoomID', sql.Int, v.positiveInt(input.roomId, 'roomId'))
    .input('CheckInDate', sql.Date, v.date(input.checkInDate))
    .input('NightsCount', sql.Int, v.positiveInt(input.nightsCount, 'nightsCount'))
    .input('TotalPrice', sql.Float, v.amount(input.totalPrice, 'totalPrice'));
}
module.exports = { room, staff, booking };