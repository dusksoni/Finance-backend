# Kushal Finance Backend

This Node.js/Express application exposes the REST APIs consumed by the Kushal Finance frontend. It uses Prisma with PostgreSQL, JWT authentication, Twilio Verify for OTP flows, and several domain controllers (loans, payments, approvals, employees, etc.).

---

## 🧱 Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express 5
- **ORM**: Prisma Client (PostgreSQL)
- **Auth**: JWT, cookies
- **Messaging**: Twilio Verify (OTP)
- **Storage**: Cloudinary for files (via generic `File` model)

---

## ✅ Prerequisites

- Node.js **18+** (20 LTS recommended)
- PostgreSQL database
- npm or yarn
- (Optional) Java runtime if you plan to use the terminate/encryption bridge
- Twilio account with Verify service for OTP flows (optional if disabled)

---

## 🔐 Environment Variables (`kushal-finance-backend/.env`)

Create a `.env` file in the backend root. Required keys:

| Variable | Description |
| -------- | ----------- |
| `PORT` | Port for the Express server (default `3001`). |
| `DATABASE_URL` | PostgreSQL connection string used by Prisma. |
| `COMPANY_NAME` | Used for seeding/branding. |
| `SECRET_KEY` | JWT secret for admin/employee auth. |
| `SECRET_KEY_NODE_AUTH` | JWT secret for user self-service auth. |
| `SECRET_KEY_TERMINATE` | Shared secret for terminate API flows. |
| `CLIENT_ID_TERMINATE`, `USER_PWD_TERMINATE` | Credentials for terminate integration. |
| `CIBIL_MEMBER_CODE`, `CIBIL_MEMBER_SHORT_NAME` | Metadata printed on CIBIL reports. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` | Twilio Verify credentials for OTP flows. |
| `JAVA_PATH` *(optional)* | Custom path to the Java binary if you run the encryption bridge. |
| `JAVA_ENCRYPTOR_JAR` *(optional)* | Path to the encryption JAR file. |

Example `.env`:

```env
PORT=3001
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/kushal_finance
COMPANY_NAME=Kushal Finance

SECRET_KEY=super-secret-admin-token
SECRET_KEY_NODE_AUTH=super-secret-user-token

TWILIO_ACCOUNT_SID=ACXXXXXXXXXXXX
TWILIO_AUTH_TOKEN=XXXXXXXXXXXX
TWILIO_VERIFY_SERVICE_SID=VAXXXXXXXXXXXX

SECRET_KEY_TERMINATE=terminate-secret
CLIENT_ID_TERMINATE=terminate-client
USER_PWD_TERMINATE=terminate-password
```

> 🔐 Keep JWT/twilio secrets consistent across environments. Changing them will invalidate current sessions.

---

## 🚀 Setup & Run

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure `.env`**
   - Populate the variables listed above.

3. **Run Prisma migrations**
   ```bash
   npx prisma migrate dev   # or migrate deploy in CI/prod
   ```

4. **Seed sample data (optional)**
   ```bash
   npx prisma db seed
   ```

5. **Start the server**
   ```bash
   npm run dev    # nodemon (if configured) or
   npm start      # production mode
   ```

The API listens on `http://localhost:3001` by default. Point the frontend’s `VITE_API_BASE_URL` to this URL.

---

## 📜 Scripts

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Start the server in dev/watch mode. |
| `npm start` | Start the server in production mode. |
| `npx prisma migrate dev` | Apply schema changes locally. |
| `npx prisma migrate deploy` | Apply migrations in CI/prod. |
| `npx prisma studio` | Inspect/edit DB records with Prisma Studio. |

---

## 🧩 Notes & Tips

- Controllers live under `controllers/`. Review them to understand request/response shapes.
- Middleware (auth, permission checks) lives in `middleware/`.
- Prisma schema and migrations are under `prisma/`.
- Keep the frontend and backend cookie keys (`TOKEN_COOKIE_KEY`, `ROLE_COOKIE_KEY`) aligned.
- For OTP flows, make sure Twilio Verify service SID is active or stub the verification routes for local testing.
- If you rely on the terminate integration, ensure the external service credentials (`SECRET_KEY_TERMINATE`, etc.) are valid.

---

Need instructions for the React app? See [`../finance-frontend/README.md`](../finance-frontend/README.md).
