# RIGHTSKU Employee App

Android employee app for RIGHTSKU Solutions Private Limited, with Employee and HR/Admin roles.

| Folder | What it is | Status |
|---|---|---|
| `frontend/` | The app screens (React + TypeScript + Vite + Tailwind CSS) | Phase 1 done |
| `backend/` | Spring Boot + PostgreSQL server | Comes in Phase 4 |

## Run the app on your computer

1. Install **Node.js LTS** from https://nodejs.org (one time only).
2. Open a terminal in the `frontend` folder and run:

   ```
   npm install
   npm run dev
   ```

3. Open the address shown (usually http://localhost:5173) in Chrome.
4. To see it at phone size: press **F12**, then click the phone icon at the top-left of the panel.

## Demo logins (development only, sample data)

| Role | Employee ID | Password |
|---|---|---|
| Employee | EMP001 | demo123 |
| HR/Admin | HR001 | demo123 |

These are fake accounts for showing the screens. Real secure login comes in Phase 4.

## Check that the project builds

```
npm run build
```

It should end with a line like `✓ built in ...`. The finished files go into `frontend/dist`.
