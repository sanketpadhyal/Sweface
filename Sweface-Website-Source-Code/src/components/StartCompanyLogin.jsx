import React from "react";
import { Link } from "react-router-dom";
import "./StartCompanyLogin.css";
import TrustFooter from "./TrustFooter";
import logoImg from "../assets/logo.png";
import nameImg from "../assets/name.png";
import leftChevronIcon from "../assets/left-chevron.png";

const supportEmail = "sanketpadhyal3@gmail.com";
const setupMailSubject = "SweFace company setup request";
const setupMailBody = [
  "Hello SweFace Team,",
  "",
  "I want to create a company login for SweFace.",
  "",
  "Company name:",
  "Contact person name:",
  "Contact phone number:",
  "Admin email address:",
  "Company address:",
  "Expected number of employees:",
  "",
  "Additional details:",
  "",
  "Thank you."
].join("\n");

function ArrowUpRightIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="company-login-arrow"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 12L12 4M6 4H12V10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function StartCompanyLogin() {
  return (
    <div className="company-login-container">
      <main className="company-login-main">
        <section className="company-login-intro" aria-labelledby="company-login-title">
          <div className="company-login-brand">
            <img src={logoImg} alt="SweFace logo" />
            <img src={nameImg} alt="SweFace" />
          </div>

          <p className="company-login-eyebrow">Company setup</p>
          <h1 id="company-login-title">
            Start your company login with SweFace.
          </h1>
          <p className="company-login-lead">
            Company creation is handled directly by the SweFace team.
          </p>
          <p className="company-login-copy">
            New company accounts cannot be created manually from the login page.
            To create your company, mail us with your company details and we will
            set it up for you.
          </p>
        </section>

        <section className="company-login-card" aria-label="Company setup contact">
          <span>Email us</span>
          <strong>{supportEmail}</strong>
          <p>
            Send your company name, contact person, and the email address you want
            to use for admin access.
          </p>
          <a
            href={`mailto:${supportEmail}?subject=${encodeURIComponent(setupMailSubject)}&body=${encodeURIComponent(setupMailBody)}`}
            className="company-login-mail-button"
          >
            Mail for company setup <ArrowUpRightIcon />
          </a>
        </section>

        <section className="company-login-notes" aria-label="Setup notes">
          <div>
            <span>Manual signup</span>
            <strong>Not available</strong>
          </div>
          <div>
            <span>Setup method</span>
            <strong>Email request only</strong>
          </div>
          <div>
            <span>Next step</span>
            <strong>We create your company login</strong>
          </div>
        </section>

        <Link to="/" className="company-login-back">
          <img src={leftChevronIcon} alt="" className="company-login-back-icon" />
          Back to home
        </Link>
      </main>

      <TrustFooter />
    </div>
  );
}
