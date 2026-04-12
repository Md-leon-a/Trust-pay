# TrustPay-MFS

Simple mobile financial service app using Node.js, Express, MySQL, HTML, CSS and vanilla JavaScript.

## Features

- Sign in
- Create account
- Add money
- Cash out
- Transfer money

## 1. Setup MySQL

Run the SQL script:

```sql
SOURCE database.sql;
```

Or copy-paste `database.sql` into your MySQL client and run it.

## 2. Configure environment

Create `.env` from `.env.example`:

```env
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=trustpay
```

## 3. Install and run

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Railway deploy (GitHub)

- Push this project to GitHub.
- Create a MySQL database service (Railway MySQL plugin or external MySQL).
- In Railway service variables, set:
	- `PORT`
	- Either `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
	- Or use Railway-provided `MYSQLHOST`, `MYSQLPORT`, `MYSQLUSER`, `MYSQLPASSWORD`, `MYSQLDATABASE`
	- Or use a single connection string in `MYSQL_URL` or `DATABASE_URL`
- Import `database.sql` into the connected MySQL instance.
- Deploy from GitHub repo.

Start command is already configured with:

```bash
npm start
```