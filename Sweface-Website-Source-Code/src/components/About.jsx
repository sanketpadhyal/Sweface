import React from "react";
import "./About.css";
import TrustFooter from "./TrustFooter";

export default function About() {
  return (
    <div className="about-container">
      <section className="about-hero">
        <h1 className="about-headline">
          The story behind <span className="text-white">frictionless flow.</span>
        </h1>
        <p className="about-subtext">
          Bridging physical workplaces and secure cloud environments through privacy-first, on-device facial recognition.
        </p>
      </section>

      <section className="story-section">
        <div className="about-story-card">
          <div className="story-content">
            <span className="story-tag">Our Vision</span>
            <h2>Physical verification shouldn't slow you down.</h2>
            <p>
              Traditional biometric attendance relies on expensive, single-purpose hardware or unhygienic fingerprint scanners. Mobile apps often require manual clicks that drop out on weak network connections. 
            </p>
            <p>
              SweFace was built to turn standard, readily available tablets and mobile devices into intelligent front-desk kiosks. By moving facial verification directly onto the local device processor, we eliminated sync delays and ensured that your verification flow remains private, secure, and instant.
            </p>
          </div>
          <div className="story-highlight">
            <div className="stat-circle">
              <strong>&lt;1s</strong>
              <span>Check-in Time</span>
            </div>
            <div className="stat-circle">
              <strong>100%</strong>
              <span>On-device Safety</span>
            </div>
          </div>
        </div>
      </section>

      <section className="pipeline-section">
        <h2 className="section-title">The On-Device Pipeline</h2>
        <div className="pipeline-grid">
          <div className="pipeline-step">
            <span className="step-num">01</span>
            <h3>Camera Proximity</h3>
            <p>
              The front-desk kiosk uses proximity detection to wake the camera lens. Face landmarks are detected instantly as the employee approaches.
            </p>
          </div>

          <div className="pipeline-step">
            <span className="step-num">02</span>
            <h3>Liveness Check</h3>
            <p>
              On-device liveness validation processes micro-movements to ensure a physical presence, preventing photo or screen spoofing attempts.
            </p>
          </div>

          <div className="pipeline-step">
            <span className="step-num">03</span>
            <h3>Local Verification</h3>
            <p>
              The captured face vector is compared against localized, encrypted workspace records, matching identity in milliseconds.
            </p>
          </div>

          <div className="pipeline-step">
            <span className="step-num">04</span>
            <h3>Sync Queue Cache</h3>
            <p>
              The check-in log is stored locally. If the network is active, it syncs instantly; if offline, it queues safely to upload later.
            </p>
          </div>
        </div>
      </section>

      <section className="pillars-section">
        <h2 className="section-title">Core Pillars</h2>
        <div className="pillars-grid">
          <div className="pillar-card">
            <h3>Privacy Protection</h3>
            <p>
              We prioritize data privacy. Face scans are mathematically hashed into one-way vectors immediately. We never store, transmit, or share raw images.
            </p>
          </div>

          <div className="pillar-card">
            <h3>Local-First Performance</h3>
            <p>
              Running verification local to the hardware eliminates API network latency, ensuring a smooth, fluid user experience with instant confirmations.
            </p>
          </div>

          <div className="pillar-card">
            <h3>Offline Resilience</h3>
            <p>
              Network drops should never block attendance. Our local-first database queue retains all verification history and auto-syncs when reconnecting.
            </p>
          </div>
        </div>
      </section>

      <TrustFooter />
    </div>
  );
}
