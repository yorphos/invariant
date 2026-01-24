# Troubleshooting Guide

## Common Issues and Solutions

### Issue: Infinite Loop on `npm run dev`

**Symptoms:**
```
Running BeforeDevCommand (`npm run dev`)
> invariant@0.0.0 dev
> tauri dev
     Running BeforeDevCommand (`npm run dev`)
...
(repeats infinitely)
```

**Cause:**
The `beforeDevCommand` in `tauri.conf.json` was set to `npm run dev`, which calls `tauri dev`, creating a recursive loop.

**Solution:**
This has been fixed. The package.json now has:
- `npm run dev` - Runs Tauri (which starts Vite automatically)
- `npm run dev:vite` - Runs Vite only
- `npm run build` - Builds Vite for production
- `npm run build:tauri` - Builds Tauri app for production

The `tauri.conf.json` correctly uses `npm run dev:vite` for the `beforeDevCommand`.

---

### Issue: Port 5173 Already in Use

**Symptoms:**
```
Error: Port 5173 is already in use
```

**Solution:**
1. Kill any existing Vite processes:
   ```bash
   # Linux/macOS
   lsof -ti:5173 | xargs kill -9
   
   # Windows
   netstat -ano | findstr :5173
   taskkill /PID <PID> /F
   ```
2. Or change the port in `vite.config.ts`:
   ```typescript
   export default defineConfig({
     server: {
       port: 5174 // Use a different port
     }
   });
   ```
   Then update `src-tauri/tauri.conf.json` to match.

---

### Issue: "Failed to initialize database"

**Symptoms:**
Application shows error screen with database initialization failure.

**Common Causes:**
1. **SQL syntax error in migrations**
2. **Database file is locked** (another instance running)
3. **Permissions issue** (can't write to app data directory)

**Solutions:**

**For syntax errors:**
1. Check console output for specific SQL error
2. Review the migration file mentioned in the error
3. Run `npm run check` to catch TypeScript errors in migrations

**For locked database:**
1. Close all instances of the app
2. Find and delete the database file:
   - Windows: `%APPDATA%\com.tauri.dev\invariant.db`
   - macOS: `~/Library/Application Support/com.tauri.dev/invariant.db`
   - Linux: `~/.local/share/com.tauri.dev/invariant.db`
3. Restart the app

**For permissions:**
1. Ensure your user has write access to the app data directory
2. On Linux, check SELinux/AppArmor policies
3. Try running once with elevated permissions to create the directory

---

### Issue: Type Errors in Migration Files

**Symptoms:**
```
Error: Cannot find module '../lib/services/database'
```

**Cause:**
Migration files are in `migrations/` folder and need correct relative path to `src/`.

**Solution:**
Ensure all migration imports use:
```typescript
import type { Migration } from '../src/lib/services/database';
```

Not:
```typescript
import type { Migration } from '../lib/services/database'; // Wrong!
```

---

### Issue: Rust Compilation Errors

**Symptoms:**
```
error: could not compile `app`
```

**Common Causes:**
1. Missing Rust dependencies
2. Outdated Rust version
3. Platform-specific build tools missing

**Solutions:**

1. **Update Rust:**
   ```bash
   rustup update stable
   ```

2. **Install build tools:**
   - Windows: Visual Studio C++ Build Tools
   - macOS: `xcode-select --install`
   - Linux: `sudo apt install build-essential`

3. **Clean and rebuild:**
   ```bash
   cd src-tauri
   cargo clean
   cd ..
   npm run dev
   ```

---

### Issue: Hot Module Replacement Not Working

**Symptoms:**
Changes to Svelte files don't appear in the running app.

**Solutions:**

1. **For frontend changes:** Should work automatically. If not:
   - Check browser console for errors
   - Hard refresh (Ctrl+Shift+R / Cmd+Shift+R)
   - Restart the dev server

2. **For backend (Rust) changes:**
   - HMR doesn't work for Rust
   - Stop the dev server (Ctrl+C)
   - Run `npm run dev` again

3. **For migration changes:**
   - Delete the database file (see locations above)
   - Restart the app

---

### Issue: White Screen / Blank App

**Symptoms:**
App window opens but shows nothing or is blank white.

**Solutions:**

1. **Check browser console** (if using `npm run dev:vite` directly):
   - Open DevTools (F12)
   - Look for JavaScript errors

2. **Check Tauri console output:**
   - Look for error messages in the terminal
   - WebView errors will be printed there

3. **Verify Vite is running:**
   ```bash
   curl http://localhost:5173
   ```
   Should return HTML, not error

4. **CSP issues:**
   - Check browser console for CSP violations
   - Temporarily disable CSP in `tauri.conf.json` to test:
     ```json
     "security": {
       "csp": null
     }
     ```

---

### Issue: "Permission Denied" Errors

**Symptoms:**
App crashes or shows errors when trying to access database/files.

**Cause:**
Missing permissions in `capabilities/default.json`.

**Solution:**
Ensure the following permissions are granted:
```json
{
  "permissions": [
    "core:default",
    "sql:default",
    "sql:allow-load",
    "sql:allow-execute",
    "sql:allow-select",
    "fs:default",
    "fs:allow-app-read",
    "fs:allow-app-write",
    "fs:allow-app-read-recursive",
    "fs:allow-app-write-recursive"
  ]
}
```

---

### Issue: Cannot Connect to Frontend Dev Server

**Symptoms:**
```
Waiting for your frontend dev server to start on http://localhost:5173/...
```
(hangs indefinitely)

**Solutions:**

1. **Check if Vite is starting:**
   - Look at terminal output for Vite startup messages
   - Should see "Local: http://localhost:5173/"

2. **Port conflict:**
   - Another service might be using port 5173
   - Change the port in `vite.config.ts` and `tauri.conf.json`

3. **Firewall blocking:**
   - Check firewall settings
   - Allow Node.js / Vite through firewall

4. **Manual start:**
   ```bash
   # Terminal 1: Start Vite
   npm run dev:vite
   
   # Terminal 2: Start Tauri (after Vite is running)
   npm run tauri dev
   ```

---

### Issue: Database Schema Out of Sync

**Symptoms:**
Errors about missing tables or columns.

**Cause:**
Database was created with old migrations, new migrations added.

**Solution:**
1. **Clean slate approach (development only):**
   - Delete the database file
   - Restart the app (migrations run automatically)

2. **Production approach:**
   - Write a new migration to alter the schema
   - Never edit existing migrations
   - Increment migration version

---

### Getting More Help

If you encounter an issue not listed here:

1. **Check logs:**
   - Terminal output (both Tauri and Vite)
   - Browser console (F12)
   - Application logs (if logging implemented)

2. **Verify setup:**
   - `npm run check` - TypeScript errors
   - `rustc --version` - Rust installed
   - `node --version` - Node.js version

3. **Clean install:**
   ```bash
   rm -rf node_modules
   rm -rf src-tauri/target
   npm install
   npm run dev
   ```

4. **Report issue:**
   - Include error messages
   - Include OS and versions (Node, Rust, npm)
   - Include steps to reproduce
