# HotelDB - Lab 3

## Technologies

- Node.js, Express, JavaScript
- Microsoft SQL Server (`mssql`, `msnodesqlv8`)
- Windows Authentication

## Setup

Requires Node.js 22+, SQL Server Express, and Microsoft ODBC Driver 17 or 18.

```powershell
cd backend
npm ci
Copy-Item .env.example .env
npm start
```

Configure `.env` with your local SQL Server connection settings. The API runs at `http://127.0.0.1:3000`.