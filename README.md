# SweFace

Private open-source face recognition attendance system for companies.

SweFace is a full-stack attendance platform. It includes a React Native mobile app, a React website with an admin dashboard, and a Node.js backend connected to Firebase Firestore. The system is built to register employees, verify faces, mark attendance, sync data, and give admins clear attendance reports.

## Demo Company Login

Use this demo company account to understand the product flow.

| Field | Value |
| --- | --- |
| Username | `sweface` |
| Password | `sweface123` |

This login is used for company access in the mobile app. The same company account can also be used for the admin panel when the backend is configured with this company.

## Project Modules

| Module | Folder | Purpose |
| --- | --- | --- |
| Mobile App | `SweFace Application/` | Employee registration, face verification, attendance marking, local storage, offline sync |
| Website and Admin Panel | `Sweface Boarding Website/` | Public website, company setup page, admin dashboard, reports, attendance settings |
| Backend API | `backend/` | Authentication, employee APIs, attendance sync, admin APIs, Firebase connection |
| Database | Firebase Firestore | Company records, employee records, face embeddings, attendance sheets |

## Product Summary

SweFace helps companies replace manual attendance with face-based attendance. The mobile app works like a kiosk or company attendance device. Employees register once, then scan their face to mark attendance. If the internet is down, attendance is saved locally and synced later.

The admin panel gives company owners or managers a view of employees, attendance dates, present/absent records, late status, settings, and manual corrections.

## Main Features

### Company Access

- Company login for the mobile attendance app.
- Admin login for the web admin panel.
- JWT-based authentication.
- Multi-company support.
- Company settings stored in Firebase.

### Employee Registration

- Employee name, employee ID, department, designation, and password.
- Form validation for required employee details.
- Face enrollment through the camera.
- Multiple face samples for stronger matching.
- Duplicate face check before registration.
- Employee data saved locally and synced to backend.

### Face Verification

- Camera-based face scan.
- Liveness checks for real face detection.
- One-face-only validation.
- Centered face validation.
- Blink and smile checks.
- ONNX-based face embedding on the device.
- Cosine similarity matching against saved employee embeddings.

### Attendance

- Attendance is marked only after a successful face match.
- Attendance cutoff time and grace minutes are supported.
- One employee is not marked twice for the same day.
- Attendance includes timestamp, confidence, similarity, and verification metadata.
- Late records can be rejected based on company settings.

### Offline Sync

- Attendance is saved locally first.
- If internet is unavailable, records stay in a local queue.
- When internet returns, queued attendance is uploaded to the backend.
- Queue records are removed after successful sync or backend rejection.
- Network status is checked from the mobile app.

### Admin Dashboard

- Company dashboard with attendance summary.
- Employee list and employee-wise reports.
- Date-wise attendance reports.
- Present, absent, late, and on-time status.
- Monthly and employee charts.
- Attendance settings for expected time and grace minutes.
- Subscription start and end date support.
- Manual attendance correction.
- Employee delete support.
- Browser cache for faster dashboard loading.

## Repository Structure

```text
SweFace/
|-- SweFace Application/
|   |-- App.js
|   `-- src/
|       |-- pages/
|       |-- face verification/
|       |-- services/
|       |-- hooks/
|       |-- components/
|       `-- assets/
|
|-- Sweface Boarding Website/
|   |-- src/
|   |   |-- components/
|   |   `-- admin panel/
|   `-- public/
|
|-- backend/
|   |-- index.js
|   |-- auth/
|   |-- admin-panel/
|   |-- attendance/
|   |-- companies/
|   |-- firebase/
|   `-- user-face/
|
`-- README.md
```

## Mobile App Flow

### 1. App Start

The app starts from `App.js` and opens the splash screen. It checks saved data such as company session, company profile, employees, attendance queue, and last sync status.

### 2. Company Login

The company enters username and password. For demo use:

| Username | Password |
| --- | --- |
| `sweface` | `sweface123` |

After login, the backend returns a token and company details. The app saves the session and company settings locally.

### 3. Employee Registration

The company can register an employee from the onboarding page. The form collects employee details and then starts face registration.

During registration:

- The app validates employee details.
- The camera opens for face capture.
- The app checks liveness.
- Multiple face embeddings are created.
- The app checks with the backend if the face already exists.
- If the face is new, employee data is saved locally and uploaded.

### 4. Face Verification for Attendance

When an employee comes for attendance:

- The camera captures the face.
- The app checks that the face is real and usable.
- The app creates a live face embedding.
- The live embedding is compared with saved employee embeddings.
- If the match is strong enough, attendance is marked.

### 5. Attendance Storage

Attendance is first saved on the device. This makes the app reliable even when the internet connection is weak.

Each attendance record can include:

- Employee ID
- Employee name
- Company name
- Date
- Timestamp
- Confidence score
- Similarity score
- Sync status

### 6. Sync to Backend

The app syncs attendance records to the backend when internet is available. If the backend accepts the records, they are removed from the local queue. If the employee is late based on company settings, the backend can reject the record and the app clears it from the queue.

## Website and Admin Panel

The website is built with React. It contains both public product pages and the admin dashboard.

### Public Website

Main routes:

| Route | Purpose |
| --- | --- |
| `/` | Home page |
| `/about` | Product explanation |
| `/contact` | Contact and project links |
| `/start-company-login` | Company setup information |
| `/admin` | Admin panel |

### Admin Panel

The admin panel is used by company owners or managers. It connects to the backend and shows company attendance data.

Admin panel capabilities:

- Login and session validation.
- Dashboard summary.
- Date filter for attendance reports.
- Employee search.
- Employee attendance details.
- Date attendance details.
- Manual present/absent update.
- Expected attendance time update.
- Grace minute update.
- Subscription date update.
- Employee delete.
- Cached dashboard data using IndexedDB.

## Backend Architecture

The backend is built with Express and Firebase Admin. It protects routes with JWT authentication, applies rate limits, handles CORS, and stores data in Firestore.

### Main Backend Files

| File | Responsibility |
| --- | --- |
| `backend/index.js` | Starts the server, configures security middleware, connects routes |
| `backend/firebase/admin.js` | Initializes Firebase Admin and Firestore |
| `backend/auth/login.js` | Mobile company login and session validation |
| `backend/admin-panel/auth/adminpanel-auth.js` | Admin login, cookie/session handling, logout |
| `backend/user-face/user-and-face-entry.js` | Employee registration, employee list, duplicate face check |
| `backend/attendance/attendance.js` | Attendance sync and today attendance |
| `backend/admin-panel/adminpanel.js` | Dashboard, reports, settings, manual attendance update, employee delete |
| `backend/companies/companies.js` | Reads company configuration |
| `backend/companies/firestoreCompanies.js` | Syncs company data into Firestore |
| `backend/companies/companySettings.js` | Reads and saves attendance/subscription settings |

### API Groups

| API Group | Purpose |
| --- | --- |
| `/auth` | Mobile company authentication |
| `/admin-panel/auth` | Admin authentication |
| `/admin-panel` | Dashboard, settings, reports, manual corrections |
| `/employees` | Employee registration, employee list, duplicate face check |
| `/attendance` | Attendance sync and attendance read APIs |
| `/health` | Backend health check |
| `/info` | Public company information |

## Firebase Data Model

SweFace uses Firestore as the main cloud database.

| Collection Path | Purpose |
| --- | --- |
| `companies/{companyId}` | Company record, login metadata, admin settings |
| `companies/{companyId}/users/{employeeDocumentId}` | Employee profile records |
| `faceEmbeddings/{companyNameOrId}/users/{employeeDocumentId}` | Face embeddings for matching and duplicate checks |
| `attendance/{companyName}/attendance/{date}` | Daily attendance sheet |

Daily attendance sheets include:

- Total employees
- Attended count
- Not attended count
- Present employees
- Absent employees
- Attendance timestamps
- Last update time

## Full System Flow

1. Company credentials are configured in the backend.
2. Backend syncs the company into Firestore.
3. Company logs in from the mobile app using the demo or configured login.
4. Admin can open the web admin panel with the company login.
5. Employee is registered in the mobile app.
6. App captures face data and creates embeddings.
7. Backend checks if the same face already exists.
8. Employee profile and face embeddings are saved.
9. Employee scans face for attendance.
10. App verifies liveness and matches the face locally.
11. Attendance is saved locally first.
12. Attendance syncs to backend when online.
13. Backend stores attendance in Firestore.
14. Admin panel reads Firestore-backed reports through backend APIs.

## Technology Stack

| Layer | Technology |
| --- | --- |
| Mobile | Expo, React Native, Expo Camera |
| Local Storage | AsyncStorage, Expo SecureStore |
| Face Engine | ONNX Runtime React Native, MobileFaceNet/ArcFace model |
| Website | React, React Router, Recharts, Lenis |
| Backend | Node.js, Express, Firebase Admin |
| Security | JWT, Helmet, CORS, Express Rate Limit |
| Database | Firebase Firestore |

## Security and Privacy Notes

- Raw camera photos are not the main stored identity data.
- Face data is converted into embeddings for matching.
- Company data is separated by company ID and company folder name.
- JWT is used for protected mobile and admin APIs.
- Rate limits protect login and admin routes.
- `.env` files must stay private.
- Firebase service account files must stay private.
- Demo credentials should be replaced for real production use.
- Firebase keys should be rotated if they are ever exposed.

## Current Status

SweFace is a working full-stack project:

- Mobile app can log in companies, register employees, verify faces, and mark attendance.
- Backend can authenticate users, store employees, check duplicate faces, sync attendance, and serve admin reports.
- Website can show product pages and run the admin dashboard.
- Firestore stores company, employee, face embedding, and attendance data.
- Offline attendance and later sync are supported.

## Visibility

This repository is private open source. The code is available inside this private project, but secrets, Firebase credentials, company passwords, and production environment files should not be exposed publicly.
