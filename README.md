# RIGHTSKU Employee App

Android employee app for RIGHTSKU Solutions Private Limited, with Employee and HR/Admin roles.

| Folder | What it is | Status |
|---|---|---|
| `frontend/` | The app screens (React + TypeScript + Vite + Tailwind CSS) | Phase 1 done |
| `backend/` | Spring Boot + PostgreSQL server (login API) | In progress |

## Run the app on your computer

1. Install **Node.js LTS** from https://nodejs.org (one time only).
2. Open a terminal in the `frontend` folder and run:

   ```
   npm install
   npm run dev
   ```

3. Open the address shown (usually http://localhost:5173) in Chrome.
4. To see it at phone size: press **F12**, then click the phone icon at the top-left of the panel.

## Signing in

Sign-in uses the real backend (`POST /api/auth/login`). There are no demo accounts.

- **Employees** sign in with their **Employee ID** (for example `EMP001`) and password.
- **HR Admins** sign in with their **work email** and password.

To sign in during development:

1. Start PostgreSQL and the backend (`cd backend`, then `.\mvnw.cmd spring-boot:run`).
2. Start the frontend with `npm run dev`. The dev server forwards `/api` to
   `http://localhost:8080`.
3. Sign in with an existing account, for example the HR Admin created by the
   one-time bootstrap (email sign-in). Never put passwords in this file or in the code.

The app contains no sample data. Dashboard sections stay empty until their backend APIs are connected.

Details, Employee ID rules, login rate limiting and the changes still required
before employee accounts can be created: [docs/authentication.md](docs/authentication.md).

## Check that the project builds

```
npm run build
```

It should end with a line like `✓ built in ...`. The finished files go into `frontend/dist`.
