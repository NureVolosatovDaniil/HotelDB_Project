const { getPool, closePool } = require('./db');
(async () => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT DB_NAME() AS DatabaseName, @@SERVERNAME AS ServerName, @@DATEFIRST AS DateFirst, GETDATE() AS ServerDate;
      SELECT s.name AS SchemaName,o.name,o.type_desc FROM sys.objects o
      JOIN sys.schemas s ON s.schema_id=o.schema_id
      WHERE o.is_ms_shipped=0 AND o.type IN ('U','P','FN','IF','TF','TR') ORDER BY o.type,o.name;
      SELECT OBJECT_NAME(c.object_id) AS TableName,c.name,TYPE_NAME(c.user_type_id) AS DataType,
             c.max_length,c.precision,c.scale,c.is_nullable,c.is_identity
      FROM sys.columns c WHERE OBJECT_NAME(c.object_id) IN
      ('Rooms','RoomCategories','Bookings','Staff','BookingLogs','AccessDeniedLogs') ORDER BY c.object_id,c.column_id;
      SELECT OBJECT_NAME(p.object_id) AS ObjectName,p.name,TYPE_NAME(p.user_type_id) AS DataType,
             p.max_length,p.precision,p.scale FROM sys.parameters p
      WHERE OBJECT_NAME(p.object_id) IN
      ('fn_GetMaxBookingByRoom','fn_GetRoomsCheaperThan','fn_GetSecondPopularRoom','usp_DeleteStaffByLowRevenue','usp_DeleteRoomsByCategory');
      SELECT o.name,m.definition FROM sys.sql_modules m JOIN sys.objects o ON o.object_id=m.object_id
      WHERE o.name IN ('fn_GetMaxBookingByRoom','fn_GetRoomsCheaperThan','fn_GetSecondPopularRoom',
        'usp_DeleteStaffByLowRevenue','usp_DeleteRoomsByCategory','tr_CheckBookingWeekend',
        'tr_CategoryBookingThreshold','tr_BookingLoging');
      SELECT name,is_disabled,OBJECT_NAME(parent_id) AS ParentTable FROM sys.triggers;`);
      
    result.recordsets.forEach((rows, index) => console.log(JSON.stringify({ section: index + 1, rows }, null, 2)));
  } catch {
    console.error('Read-only inspection failed. Check connection settings and metadata permissions.');
    process.exitCode = 1;
  } finally { 
    await closePool().catch(() => {}); 
  }
})();