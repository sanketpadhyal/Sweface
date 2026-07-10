import React from "react";
import { Link } from "react-router-dom";
import "./home.css";
import SweFaceSlides from "./SweFaceSlides";
import AppWorkflow from "./AppWorkflow";
import TrustFooter from "./TrustFooter";
import supportIcon from "../assets/support.png";
import officeBuildingIcon from "../assets/office-building.png";

const APP_DOWNLOAD_URL = "https://github.com/sanketpadhyal/Sweface/releases/download/v1.0.0/sweface.apk";

function DownloadIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="download-icon"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 2V11M8 11L5 8M8 11L11 8M3 14H13"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Home() {
  const isLocalAdminHost =
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  const adminPanelUrl = isLocalAdminHost ? "/admin" : "https://sweface.netlify.app/admin";

  return (
    <div className="home-container">
      <section className="hero-section">
        <p className="hero-eyebrow">
          <span className="hero-eyebrow-light">Face Recognition</span>
          <span className="hero-eyebrow-dot">&middot;</span>
          <span className="hero-eyebrow-dark">Attendance System</span>
        </p>
        
        <h1 className="hero-headline">
          Smarter attendance for modern workplaces.{" "}
          <span className="text-muted">
            SweFace helps teams verify identity, mark attendance fast, and stay in sync.
          </span>
        </h1>
        
        <div className="hero-actions">
          <Link to="/start-company-login" className="btn-get-started">
            Start company login
            <img src={officeBuildingIcon} alt="" className="company-login-icon" />
          </Link>

          {isLocalAdminHost ? (
            <Link to={adminPanelUrl} className="btn-get-started btn-secondary">
              Admin Panel
              <img src={supportIcon} alt="" className="admin-panel-icon" />
            </Link>
          ) : (
            <a
              href={adminPanelUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-get-started btn-secondary"
            >
              Admin Panel
              <img src={supportIcon} alt="" className="admin-panel-icon" />
            </a>
          )}

          <a
            href={APP_DOWNLOAD_URL}
            target="_blank"
            rel="noreferrer"
            className="btn-get-started"
          >
            Download App <DownloadIcon />
          </a>
        </div>
      </section>

      <SweFaceSlides />
      <AppWorkflow />
      <TrustFooter />
    </div>
  );
}
