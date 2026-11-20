USE HotelDB;
GO
CREATE FUNCTION dbo.fn_GetBookingCountByRoom (@RoomNumber varchar(10))
RETURNS int
AS
BEGIN
    DECLARE @Count int;
    SELECT @Count = COUNT(*)
    FROM dbo.Bookings b
    JOIN dbo.Rooms r ON r.RoomID = b.RoomID
    WHERE r.RoomNumber = @RoomNumber;
    RETURN @Count;
END;
GO
CREATE PROCEDURE dbo.usp_DemoBookingError
AS
BEGIN
    SET NOCOUNT ON;
    THROW 50001, N'Demonstration: the booking request was rejected by SQL Server.', 1;
END;
GO