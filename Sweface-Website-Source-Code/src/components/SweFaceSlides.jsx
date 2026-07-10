import React from "react";
import "./SweFaceSlides.css";
import logoutIllustration from "../assets/logout-illustration-svg-download-png-12470870.webp";
import appPreviewImage from "../assets/6147481674426552668 (1).jpg";
import faceIconImg from "../assets/faceicon.png";

const slides = [
  {
    id: "company",
    accent: "dark",
    previewOnly: true
  },
  {
    id: "scan",
    kicker: "Live kiosk",
    title: "Face scan attendance in seconds",
    copy: "Employees walk up, smile, and mark attendance without touching a shared device.",
    accent: "blue"
  },
  {
    id: "offline",
    kicker: "Offline ready",
    title: "Attendance stays queued",
    copy: "When internet drops, SweFace keeps records safe and syncs when the company session returns.",
    accent: "orange"
  },
  {
    id: "recovery",
    kicker: "Clean recovery",
    title: "Expired sessions guide users back",
    copy: "If login changes, the app explains what happened and brings users back without losing offline data.",
    accent: "white"
  }
];

function FaceMockup() {
  return (
    <div className="mock-phone" aria-hidden="true">
      <div className="mock-topbar" />
      <div className="mock-camera">
        <img src={faceIconImg} alt="Face verified" className="mock-face-img" />
        <div className="scan-ring" />
      </div>
      <div className="mock-status">
        <strong>Face verified</strong>
        <small>Attendance marked</small>
      </div>
    </div>
  );
}

function QueueMockup() {
  return (
    <div className="queue-card" aria-hidden="true">
      <div className="queue-row active">
        <span>09:42</span>
        <strong>Pending sync</strong>
      </div>
      <div className="queue-row">
        <span>09:47</span>
        <strong>Saved offline</strong>
      </div>
      <div className="sync-line">
        <span />
      </div>
    </div>
  );
}

function CompanyMockup() {
  return (
    <div className="company-preview-card" aria-hidden="true">
      <img src={appPreviewImage} alt="" className="company-preview-image" />
    </div>
  );
}

function RecoveryMockup() {
  return (
    <div className="recovery-card" aria-hidden="true">
      <img
        src={logoutIllustration}
        alt=""
        className="recovery-illustration"
      />
      <strong>Login expired</strong>
      <small>Offline attendance remains saved.</small>
    </div>
  );
}

function SlideVisual({ id }) {
  if (id === "offline") return <QueueMockup />;
  if (id === "company") return <CompanyMockup />;
  if (id === "recovery") return <RecoveryMockup />;
  return <FaceMockup />;
}

export default function SweFaceSlides() {
  return (
    <section className="slides-section" id="work" aria-label="SweFace product slides">
      <div className="section-copy">
        <h2>Everything the app needs, shown as simple working moments.</h2>
      </div>

      <div className="slides-track">
        {slides.map((slide, index) => (
          <article
            className={`feature-slide feature-slide-${slide.accent} ${slide.previewOnly ? "feature-slide-preview" : ""}`}
            key={slide.id}>
            <div className="slide-number">{String(index + 1).padStart(2, "0")}</div>
            {!slide.previewOnly &&
              <div className="slide-content">
                <p>{slide.kicker}</p>
                <h3>{slide.title}</h3>
                <span>{slide.copy}</span>
              </div>}
            <SlideVisual id={slide.id} />
          </article>
        ))}
      </div>
    </section>
  );
}
