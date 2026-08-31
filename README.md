# WhatsApp Suite — Updated Backend

This package is the updated Node.js backend for the WhatsApp Bulk Software requirements supplied by management.

## What was fixed

1. **Excel Contact Import + one-day reminder**
   - `POST /api/contacts/import-excel`
   - Multipart field: `file`
   - Imports Name, Phone, Architect Name, Firm Name, Area, Address, Location, Date, Meeting/Call Date, Phone, Requirement/REQ, Email and Remark.
   - Creates a reminder exactly **1 day before Date**.
   - If a date is present in the Remark column, it is also recognised.
   - Imported contacts remain editable through `PUT /api/contacts/:id`.

2. **Bulk message media**
   - Text, image, video, PDF/document and audio are supported.
   - Upload first using `POST /api/media` (`files` field).
   - Pass returned `/uploads/...` paths in `mediaFiles`.
   - Maximum upload size is 50 MB per file.

3. **Bulk scheduling**
   - `POST /api/campaigns` with `scheduledAt`.
   - A background scheduler checks due campaigns every 15 seconds.
   - Daily/Weekly/Monthly repeat is supported.
   - Scheduled campaigns use the same delivery code as Quick Send.

4. **Employee management**
   - Administrator creates employee accounts.
   - Manager can view employees.
   - Administrator can update, activate/deactivate and delete accounts.
   - Role-based authorization remains enabled.

5. **Equal distribution across active devices**
   - `POST /api/messages/bulk`
   - Send `deviceIds` to explicitly select devices, or omit them to use all connected devices.
   - Recipients are distributed round-robin equally across the currently connected Baileys sessions.
   - Offline/connecting devices are not counted as active.

6. **Send options**
   - `sendText: true/false`
   - `mediaFiles: []`
   - `deviceIds: []`
   - Quick Send also accepts `deviceId`.

7. **Employee process**
   - Employee accounts use the same authentication, permissions, contact, campaign and messaging APIs.
   - Access is controlled by Administrator/Manager/Operator/Viewer roles.

8. **Real reports**
   - Reports are based on actual campaign send results, not hard-coded demo numbers.
   - Example: for 100 recipients, if 80 were successfully sent and 20 failed, the report returns `total=100, sent=80, failed=20`.
   - `GET /api/campaigns/:id/report`
   - `GET /api/reports`

9. **Dynamic contact notebook / horizontal-detail data**
   - `GET /api/contacts/:id` returns contact details plus notes.
   - `POST /api/notes` creates notes.
   - `GET /api/notes` lists notebook entries.
   - `POST /api/whatsapp/contacts/:id/schedule` creates a contact-specific schedule.
   - Backend returns structured data that can be rendered as a dynamic horizontal tab/detail page by the frontend.

10. **Schedule media attachments**
    - Campaigns and contact schedules accept `mediaFiles`.
    - The same attachment payload is used for immediate and scheduled sending.

11. **WhatsApp connection stability**
    - Existing Baileys WebSocket error protection was retained.
    - Session credentials are NOT included in this office ZIP.
    - Connect/scan each device again in the target environment.

## Additional management fixes

- **Quick Send:** fixed `/api/messages/send`; it now accepts `deviceId` in the body and supports media.
- **Notebook:** added working Notes CRUD APIs.
- **Calendar:** added `GET /api/calendar`; it combines contact dates, meeting/call dates and notes/reminders.
- **Schedule:** real campaign scheduler added; scheduled media is retained.
- **Contacts:** Excel import, search, detail, update and delete APIs fixed.
- **Legacy broken routes:** old route files were cleaned so they no longer reference invalid lower-case model paths or missing `req.files`.

## Run

### 1. Requirements
- Node.js 18+ (Node.js 20/22 recommended)
- MongoDB 6+ recommended
- A WhatsApp phone for each Baileys device session

### 2. Install
```bash
npm install
```

### 3. Configure
Copy `.env.example` to `.env` and set MongoDB/JWT values.

### 4. Start
```bash
npm start
```

Health:
`GET http://localhost:5000/health`

### 5. Demo login in memory mode
If MongoDB is unavailable in development:
- Email: `admin@whatsappsuite.com`
- Password: `admin123`

This fallback is intended for API/UI development. Real WhatsApp sending still requires a connected Baileys session.

## Recommended Postman test order

1. `POST /api/auth/login`
2. Save returned JWT as `Authorization: Bearer <token>`
3. `GET /api/devices`
4. `POST /api/devices` (create a device if needed)
5. `POST /api/devices/:id/connect`
6. `GET /api/devices/:id/qr`
7. Scan QR with WhatsApp
8. `GET /api/devices/:id/status`
9. `POST /api/media` — upload image/video/PDF/audio
10. `POST /api/messages/send` — Quick Send
11. `POST /api/messages/bulk` — multi-device bulk send
12. `POST /api/contacts/import-excel` — Excel import
13. `GET /api/contacts`
14. `GET /api/calendar`
15. `POST /api/campaigns` — scheduled or immediate campaign
16. `GET /api/campaigns/:id/report`
17. `GET /api/reports`

## Important

Baileys is a WhatsApp Web client library, not the official Meta Cloud API. Real WhatsApp delivery depends on the connected WhatsApp account/session and WhatsApp-side policies. Do not distribute or commit the `sessions/` directory because it contains authentication credentials.
