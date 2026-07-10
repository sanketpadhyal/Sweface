import React from "react";
import "./AppWorkflow.css";

const steps = [
  ["1", "Company login", "Start with the company account so every scan belongs to the right workspace."],
  ["2", "Face verification", "The kiosk checks liveness and confirms a registered employee before marking attendance."],
  ["3", "Offline safety", "Records stay saved when the network is unavailable and move to sync queue automatically."],
  ["4", "Cloud sync", "When the connection returns, attendance uploads and the queue clears without manual cleanup."]
];

const metrics = [
  ["Offline queue", "Protected"],
  ["Scan flow", "Fast"],
  ["Company data", "Separated"]
];

export default function AppWorkflow() {
  return (
    <section className="workflow-section" id="about">
      <div className="workflow-grid">
        <div className="workflow-copy">
          <p className="section-kicker">How SweFace works</p>
          <h2>Designed for front-desk, kiosk, and field attendance.</h2>
          <p>
            The app keeps the process simple for employees while handling session checks,
            duplicate protection, liveness, and sync state behind the scenes.
          </p>
        </div>

        <div className="workflow-panel">
          {steps.map(([number, title, copy]) => (
            <div className="workflow-step" key={number}>
              <span>{number}</span>
              <div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="metric-row" aria-label="SweFace highlights">
        {metrics.map(([label, value]) => (
          <div className="metric-card" key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
