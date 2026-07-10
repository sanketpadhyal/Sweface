<p align="center">
  <img src="logo.png" alt="SweFace logo" width="96" />
</p>

<h1 align="center">SweFace</h1>

<p align="center">
  A full-stack face recognition attendance system for companies, built with a mobile app, website, admin panel, backend API, and Firebase Firestore.
</p>

<p align="center">
  <a href="https://sweface.netlify.app">Website</a>
  |
  <a href="https://sweface.netlify.app/admin">Admin Panel</a>
  |
  <a href="https://github.com/sanketpadhyal/Sweface/releases/download/v1.0.0/sweface.apk">Download Android App</a>
</p>

<p align="center">
  <a href="https://sweface.netlify.app">
    <img src="https://img.shields.io/badge/Live_Website-sweface.netlify.app-00C853?style=for-the-badge&logo=netlify&logoColor=white" alt="Live website" />
  </a>
  <a href="https://sweface.netlify.app/admin">
    <img src="https://img.shields.io/badge/Admin_Panel-Open_Dashboard-111827?style=for-the-badge&logo=react&logoColor=61DAFB" alt="Admin panel" />
  </a>
  <a href="https://github.com/sanketpadhyal/Sweface/releases/download/v1.0.0/sweface.apk">
    <img src="https://img.shields.io/badge/Android_App-Download_APK-3DDC84?style=for-the-badge&logo=android&logoColor=white" alt="Download Android APK" />
  </a>
</p>

## Overview

SweFace is a complete attendance product designed for real company use. It replaces manual attendance and fingerprint devices with camera-based face verification.

The mobile app is used by a company to register employees and mark attendance. The backend handles authentication, employee storage, face duplicate checks, attendance sync, and Firebase data. The website explains the product, and the admin panel shows attendance reports, employee records, charts, and company settings.

This repository contains the full private open-source codebase for the mobile app, website, admin panel, and backend.

> [!IMPORTANT]
> **Open Source Notice**
> The **mobile application and backend** are open sourced in this repository.
> The **frontend website and admin panel** are open sourced here:
> **https://github.com/sanketpadhyal/Sweface-Website-Source-Code.git**
> 
> Explore both repositories to get the complete SweFace ecosystem and implementation details.

## Demo Company Login

Use this account to test the company flow in the app and admin panel.

| Field | Value |
| --- | --- |
| Username | `sweface` |
| Password | `sweface123` |

## Product Links

| Product Surface | Link |
| --- | --- |
| Website | [sweface.netlify.app](https://sweface.netlify.app) |
| Admin Panel | [sweface.netlify.app/admin](https://sweface.netlify.app/admin) |
| Android App | [Download sweface.apk](https://github.com/sanketpadhyal/Sweface/releases/download/v1.0.0/sweface.apk) |

## What Happens In The App

The SweFace Android app is the main attendance tool.

1. Company logs in with its company account.
2. Company registers employees with name, employee ID, department, designation, password, and face scan.
3. App captures multiple face samples and creates face embeddings on the device.
4. Backend checks if the same face is already registered.
5. Employee comes in front of the camera for attendance.
6. App checks liveness, face quality, blink/smile, and face match.
7. If the face matches, attendance is saved on the phone.
8. If internet is available, attendance syncs to the backend.
9. If internet is not available, attendance stays in a local queue and syncs later.
10. Admin can see the attendance report from the web dashboard.

## Key Features

### Mobile Attendance App

- Company login with secure token session.
- Employee registration with profile details.
- Camera-based face enrollment.
- Liveness checks before accepting a scan.
- Face verification before marking attendance.
- Duplicate face protection.
- Local employee storage.
- Offline attendance queue.
- Automatic backend sync.
- Company-wise data separation.

### Website

- Public product website for SweFace.
- Home, About, Contact, and Company Setup pages.
- Download link for the Android app.
- Admin panel entry point.
- Responsive React interface.

### Admin Panel

- Company/admin login.
- Attendance dashboard.
- Employee-wise attendance reports.
- Date-wise attendance reports.
- Present, absent, late, and on-time status.
- Charts for monthly and employee attendance.
- Attendance time and grace minute settings.
- Subscription start and end date settings.
- Manual attendance correction.
- Employee delete support.
- Browser cache for faster dashboard loading.

### Backend

- Company authentication.
- Admin authentication.
- Employee registration API.
- Employee list API.
- Duplicate face check API.
- Attendance sync API.
- Admin dashboard APIs.
- Company settings APIs.
- Firebase Firestore integration.
- Security middleware, CORS, JWT, and rate limiting.

## Project Structure

| Folder | Description |
| --- | --- |
| `SweFace Application/` | Expo React Native mobile app for registration, face verification, and attendance |
| `Sweface Boarding Website/` | React website and admin dashboard |
| `backend/` | Node.js Express backend connected to Firebase |

## Main Files

### Mobile App

| File | Purpose |
| --- | --- |
| `SweFace Application/App.js` | App navigation and screen setup |
| `src/pages/onboardingpage.js` | Company login, employee registration, local employee management |
| `src/face verification/FaceVerificationPage.js` | Camera scan, liveness, face match, attendance marking |
| `src/services/faceEngine.js` | ONNX model loading, face embeddings, liveness and matching logic |
| `src/services/storage.js` | Local sessions, employees, attendance records, sync queue |
| `src/services/syncService.js` | Uploads queued attendance records to backend |

### Website and Admin Panel

| File | Purpose |
| --- | --- |
| `src/App.js` | Website routes |
| `src/components/home.jsx` | Landing page |
| `src/components/StartCompanyLogin.jsx` | Company setup information |
| `src/admin panel/adminpanel.jsx` | Full admin dashboard |

### Backend

| File | Purpose |
| --- | --- |
| `backend/index.js` | Express server and route setup |
| `backend/auth/login.js` | Mobile company login |
| `backend/admin-panel/auth/adminpanel-auth.js` | Admin login and logout |
| `backend/user-face/user-and-face-entry.js` | Employee registration and duplicate face check |
| `backend/attendance/attendance.js` | Attendance sync |
| `backend/admin-panel/adminpanel.js` | Reports, settings, manual updates, employee delete |
| `backend/firebase/admin.js` | Firebase Admin connection |

## Firebase Data Model

SweFace uses Firebase Firestore as the main database.

| Firestore Path | Stores |
| --- | --- |
| `companies/{companyId}` | Company profile and settings |
| `companies/{companyId}/users/{employeeDocumentId}` | Employee profile records |
| `faceEmbeddings/{companyNameOrId}/users/{employeeDocumentId}` | Face embeddings for matching |
| `attendance/{companyName}/attendance/{date}` | Daily attendance sheet |

## Tech Stack

| Area | Technology |
| --- | --- |
| Mobile App | Expo, React Native, Expo Camera |
| Face Engine | ONNX Runtime React Native, MobileFaceNet/ArcFace model |
| Local Storage | AsyncStorage, Expo SecureStore |
| Website | React, React Router, Recharts, Lenis |
| Backend | Node.js, Express, Firebase Admin |
| Security | JWT, Helmet, CORS, Express Rate Limit |
| Database | Firebase Firestore |

## Security And Privacy

- Face scans are converted into embeddings for matching.
- Company data is separated by company identity.
- Protected routes use JWT authentication.
- Login and admin routes use rate limiting.
- Firebase service account files and `.env` files must stay private.
- Demo credentials are for testing and should be replaced for production.

## Current Status

SweFace is a working full-stack attendance system.

- Android app is available through the release APK.
- Website is live.
- Admin panel is live.
- Backend supports login, employee records, face duplicate checks, attendance sync, reports, and settings.
- Firestore stores company, employee, face, and attendance data.
- Offline attendance and later sync are supported.

## Repository Visibility

This is a private open-source project. The full app, website, admin panel, and backend are included in this repository, but secrets, Firebase credentials, company passwords, and production environment files should never be exposed publicly.
